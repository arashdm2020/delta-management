CREATE TABLE "InboxMessage" (
  id UUID PRIMARY KEY,
  "senderId" UUID NOT NULL REFERENCES "User"(id),
  "recipientId" UUID NOT NULL REFERENCES "User"(id),
  "threadId" UUID NOT NULL REFERENCES "InboxMessage"(id),
  body VARCHAR(4000) NOT NULL CHECK (length(trim(body)) > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3),
  CHECK ("senderId" <> "recipientId")
);
CREATE INDEX "InboxMessage_recipientId_readAt_idx" ON "InboxMessage" ("recipientId","readAt");
CREATE INDEX "InboxMessage_senderId_createdAt_idx" ON "InboxMessage" ("senderId","createdAt");
CREATE INDEX "InboxMessage_threadId_createdAt_idx" ON "InboxMessage" ("threadId","createdAt");
CREATE FUNCTION delta_inbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root "InboxMessage";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Message history retained'; END IF;
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'readAt') IS DISTINCT FROM (to_jsonb(OLD)-'readAt')
     OR OLD."readAt" IS NOT NULL OR NEW."readAt" IS NULL THEN
     RAISE EXCEPTION 'Only first read receipt may change';
   END IF;
 ELSE
   IF NEW."threadId"<>NEW.id THEN
     SELECT * INTO root FROM "InboxMessage" WHERE id=NEW."threadId";
     IF root.id IS NULL OR root."threadId"<>root.id OR NOT (
       (NEW."senderId"=root."senderId" AND NEW."recipientId"=root."recipientId") OR
       (NEW."senderId"=root."recipientId" AND NEW."recipientId"=root."senderId")
     ) THEN RAISE EXCEPTION 'Invalid conversation participants'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER inbox_history BEFORE INSERT OR UPDATE OR DELETE ON "InboxMessage"
FOR EACH ROW EXECUTE FUNCTION delta_inbox_guard();
