BEGIN;
-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" VARCHAR(10000) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "authorId" UUID NOT NULL,
    "scheduledById" UUID,
    "publishedById" UUID,
    "publishAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementAudience" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "unitId" UUID,

    CONSTRAINT "AnnouncementAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRecipient" (
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRecipient_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventKey" VARCHAR(200) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "href" VARCHAR(300) NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "general" BOOLEAN NOT NULL DEFAULT true,
    "financial" BOOLEAN NOT NULL DEFAULT true,
    "meetings" BOOLEAN NOT NULL DEFAULT true,
    "tickets" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "targetKey" VARCHAR(100) NOT NULL,
    "subscriptionId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" VARCHAR(200),
    "lastError" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "errorCode" VARCHAR(40),
    "providerMessageId" VARCHAR(200),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpointHash" CHAR(64) NOT NULL,
    "encryptedSubscription" TEXT NOT NULL,
    "deviceName" VARCHAR(100) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "key" VARCHAR(40) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "content" VARCHAR(500) NOT NULL,

    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SmsDelivery" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "templateKey" VARCHAR(40) NOT NULL,
    "phoneHash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "providerMessageId" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "requestKey" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(10000) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "creatorId" UUID NOT NULL,
    "unitId" UUID,
    "assignedToId" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "requestKey" VARCHAR(100) NOT NULL,
    "content" VARCHAR(5000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "previousStatus" VARCHAR(30),
    "status" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(10000) NOT NULL,
    "agenda" VARCHAR(10000) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "location" VARCHAR(300) NOT NULL,
    "onlineUrl" VARCHAR(1000),
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rsvp" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attendance" VARCHAR(20) NOT NULL DEFAULT 'UNRECORDED',
    "recordedById" UUID,
    "recordedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("meetingId","userId")
);

-- CreateTable
CREATE TABLE "MeetingMinutes" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "content" VARCHAR(20000) NOT NULL,
    "amendmentReason" VARCHAR(500),
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "meetingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionVersion" (
    "id" UUID NOT NULL,
    "resolutionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" VARCHAR(10000) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "decisionAt" TIMESTAMPTZ(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "responsibleId" UUID NOT NULL,
    "responsibleName" VARCHAR(100) NOT NULL,
    "authorId" UUID NOT NULL,
    "amendmentReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAttachment" (
    "id" UUID NOT NULL,
    "announcementId" UUID,
    "ticketId" UUID,
    "meetingId" UUID,
    "minutesId" UUID,
    "resolutionVersionId" UUID,
    "uploaderId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_status_publishAt_idx" ON "Announcement"("status", "publishAt");

-- CreateIndex
CREATE INDEX "AnnouncementAudience_announcementId_idx" ON "AnnouncementAudience"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementRecipient_userId_idx" ON "AnnouncementRecipient"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_eventKey_key" ON "Notification"("userId", "eventKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_targetKey_key" ON "NotificationDelivery"("notificationId", "channel", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_deliveryId_number_key" ON "NotificationDeliveryAttempt"("deliveryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsDelivery_deliveryId_key" ON "SmsDelivery"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_requestKey_key" ON "Ticket"("requestKey");

-- CreateIndex
CREATE INDEX "Ticket_creatorId_createdAt_idx" ON "Ticket"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_status_assignedToId_idx" ON "Ticket"("status", "assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketComment_requestKey_key" ON "TicketComment"("requestKey");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_startsAt_status_idx" ON "Meeting"("startsAt", "status");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutes_meetingId_version_key" ON "MeetingMinutes"("meetingId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Resolution_number_key" ON "Resolution"("number");

-- CreateIndex
CREATE INDEX "Resolution_meetingId_idx" ON "Resolution"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionVersion_resolutionId_version_key" ON "ResolutionVersion"("resolutionId", "version");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_announcementId_idx" ON "CommunicationAttachment"("announcementId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_ticketId_idx" ON "CommunicationAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_meetingId_idx" ON "CommunicationAttachment"("meetingId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_minutesId_idx" ON "CommunicationAttachment"("minutesId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_resolutionVersionId_idx" ON "CommunicationAttachment"("resolutionVersionId");

-- AddForeignKey
ALTER TABLE "AnnouncementAudience" ADD CONSTRAINT "AnnouncementAudience_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRecipient" ADD CONSTRAINT "AnnouncementRecipient_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionVersion" ADD CONSTRAINT "ResolutionVersion_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive Phase 3 invariants. Existing financial rows and posting protocols are untouched.
ALTER TABLE "Announcement" ADD FOREIGN KEY("authorId") REFERENCES "User"(id), ADD FOREIGN KEY("scheduledById") REFERENCES "User"(id), ADD FOREIGN KEY("publishedById") REFERENCES "User"(id), ADD CHECK(length(trim(title))>0 AND length(trim(content))>0), ADD CHECK(category IN ('GENERAL','IMPORTANT','EMERGENCY','FINANCIAL','MEETING','SERVICE_INTERRUPTION')), ADD CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')), ADD CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED')), ADD CHECK(revision>0), ADD CHECK("expiresAt" IS NULL OR "expiresAt">COALESCE("publishAt","createdAt")), ADD CHECK(status<>'PUBLISHED' OR ("publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL)), ADD CHECK(status<>'SCHEDULED' OR ("publishAt" IS NOT NULL AND "scheduledById" IS NOT NULL));
ALTER TABLE "AnnouncementAudience" ADD FOREIGN KEY("unitId") REFERENCES "Unit"(id), ADD CHECK(kind IN ('ALL','OWNERS','TENANTS','UNITS','BOARD')), ADD CHECK((kind='UNITS')=("unitId" IS NOT NULL));
CREATE UNIQUE INDEX announcement_audience_identity ON "AnnouncementAudience"("announcementId",kind,COALESCE("unitId",'00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE "AnnouncementRecipient" ADD FOREIGN KEY("userId") REFERENCES "User"(id);
ALTER TABLE "AnnouncementRead" ADD FOREIGN KEY("announcementId","userId") REFERENCES "AnnouncementRecipient"("announcementId","userId");
ALTER TABLE "Notification" ADD FOREIGN KEY("userId") REFERENCES "User"(id), ADD CHECK(category IN ('general','financial','meetings','tickets','operational','security')), ADD CHECK(href LIKE '/%' AND href NOT LIKE '//%' AND position(chr(92) in href)=0), ADD CHECK("readAt" IS NULL OR "readAt">="createdAt");
ALTER TABLE "NotificationPreference" ADD FOREIGN KEY("userId") REFERENCES "User"(id);
ALTER TABLE "PushSubscription" ADD FOREIGN KEY("userId") REFERENCES "User"(id), ADD CHECK(length("encryptedSubscription")>0), ADD CHECK("expiresAt" IS NULL OR "expiresAt">"createdAt");
ALTER TABLE "NotificationDelivery" ADD FOREIGN KEY("subscriptionId") REFERENCES "PushSubscription"(id), ADD CHECK(channel IN ('INAPP','PUSH','SMS')), ADD CHECK(status IN ('PENDING','SENDING','DELIVERED','ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN')), ADD CHECK(attempts BETWEEN 0 AND 5), ADD CHECK((channel='PUSH')=("subscriptionId" IS NOT NULL)), ADD CHECK(status<>'DELIVERED' OR channel='INAPP'), ADD CHECK(status<>'SENDING' OR "lockedAt" IS NOT NULL);
ALTER TABLE "NotificationDeliveryAttempt" ADD CHECK(number BETWEEN 1 AND 5), ADD CHECK(status IN ('SENDING','ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN','RETRY')), ADD CHECK("finishedAt" IS NULL OR "finishedAt">="startedAt");
ALTER TABLE "SmsDelivery" ADD FOREIGN KEY("deliveryId") REFERENCES "NotificationDelivery"(id), ADD FOREIGN KEY("templateKey") REFERENCES "SmsTemplate"(key), ADD CHECK(status IN ('PENDING','SENDING','ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN'));
ALTER TABLE "Ticket" ADD FOREIGN KEY("creatorId") REFERENCES "User"(id), ADD FOREIGN KEY("unitId") REFERENCES "Unit"(id), ADD FOREIGN KEY("assignedToId") REFERENCES "User"(id), ADD CHECK(status IN ('OPEN','UNDER_REVIEW','IN_PROGRESS','WAITING_FOR_RESIDENT','RESOLVED','CLOSED','REOPENED')), ADD CHECK(category IN ('CLEANLINESS','ELEVATOR','LIGHTING','WATER','SHARED_AREA','SECURITY','SUGGESTION','OTHER')), ADD CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL'));
ALTER TABLE "TicketComment" ADD FOREIGN KEY("authorId") REFERENCES "User"(id), ADD CHECK(length(trim(content))>0);
ALTER TABLE "TicketEvent" ADD FOREIGN KEY("actorId") REFERENCES "User"(id);
ALTER TABLE "Meeting" ADD FOREIGN KEY("authorId") REFERENCES "User"(id), ADD CHECK(kind IN ('BOARD','OWNERS','GENERAL')), ADD CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED')), ADD CHECK(revision>0), ADD CHECK("onlineUrl" IS NULL OR "onlineUrl" LIKE 'https://%');
ALTER TABLE "MeetingParticipant" ADD FOREIGN KEY("userId") REFERENCES "User"(id), ADD FOREIGN KEY("recordedById") REFERENCES "User"(id), ADD CHECK(rsvp IN ('PENDING','YES','NO')), ADD CHECK(attendance IN ('UNRECORDED','PRESENT','ABSENT')), ADD CHECK((attendance='UNRECORDED')=("recordedAt" IS NULL)), ADD CHECK((attendance='UNRECORDED')=("recordedById" IS NULL));
ALTER TABLE "MeetingMinutes" ADD FOREIGN KEY("authorId") REFERENCES "User"(id), ADD CHECK(version>0), ADD CHECK(status IN ('DRAFT','FINAL')), ADD CHECK(length(trim(content))>0);
ALTER TABLE "Resolution" ADD FOREIGN KEY("meetingId") REFERENCES "Meeting"(id);
ALTER TABLE "ResolutionVersion" ADD FOREIGN KEY("responsibleId") REFERENCES "User"(id), ADD FOREIGN KEY("authorId") REFERENCES "User"(id), ADD CHECK(version>0), ADD CHECK("effectiveAt">="decisionAt"), ADD CHECK(status IN ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED'));
ALTER TABLE "CommunicationAttachment" ADD FOREIGN KEY("uploaderId") REFERENCES "User"(id), ADD FOREIGN KEY("announcementId") REFERENCES "Announcement"(id), ADD FOREIGN KEY("ticketId") REFERENCES "Ticket"(id), ADD FOREIGN KEY("meetingId") REFERENCES "Meeting"(id), ADD FOREIGN KEY("minutesId") REFERENCES "MeetingMinutes"(id), ADD FOREIGN KEY("resolutionVersionId") REFERENCES "ResolutionVersion"(id), ADD CHECK(num_nonnulls("announcementId","ticketId","meetingId","minutesId","resolutionVersionId")=1), ADD CHECK(octet_length(content)<=2097152 AND mime IN ('application/pdf','image/png','image/jpeg'));

DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"OutboxJob"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%' LOOP EXECUTE format('ALTER TABLE "OutboxJob" DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE "OutboxJob" ADD CONSTRAINT outbox_state CHECK(attempts>=0 AND status IN ('PENDING','RUNNING','DONE','DEAD'));

CREATE FUNCTION delta_communication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Communication history is retained; append an amendment'; END; $$;
CREATE TRIGGER recipient_history BEFORE UPDATE OR DELETE ON "AnnouncementRecipient" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER read_history BEFORE UPDATE OR DELETE ON "AnnouncementRead" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER comment_history BEFORE UPDATE OR DELETE ON "TicketComment" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER ticket_event_history BEFORE UPDATE OR DELETE ON "TicketEvent" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER minutes_history BEFORE UPDATE OR DELETE ON "MeetingMinutes" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER resolution_history BEFORE UPDATE OR DELETE ON "Resolution" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER resolution_version_history BEFORE UPDATE OR DELETE ON "ResolutionVersion" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER communication_attachment_history BEFORE UPDATE OR DELETE ON "CommunicationAttachment" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE TRIGGER template_history BEFORE UPDATE OR DELETE ON "SmsTemplate" FOR EACH ROW EXECUTE FUNCTION delta_communication_immutable();
CREATE FUNCTION delta_announcement_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW."authorId"<>OLD."authorId" OR NEW."createdAt"<>OLD."createdAt" OR OLD.status='ARCHIVED' THEN RAISE EXCEPTION 'Announcement history retained'; END IF;
 IF OLD.status='PUBLISHED' AND (NEW.status<>'ARCHIVED' OR (to_jsonb(NEW)-'status'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updatedAt')) THEN RAISE EXCEPTION 'Published content immutable; archive and publish a new announcement'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER announcement_history BEFORE UPDATE OR DELETE ON "Announcement" FOR EACH ROW EXECUTE FUNCTION delta_announcement_guard();
CREATE FUNCTION delta_audience_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent UUID; BEGIN
 parent=CASE WHEN TG_OP='DELETE' THEN OLD."announcementId" ELSE NEW."announcementId" END;
 PERFORM id FROM "Announcement" WHERE id=parent AND status IN ('DRAFT','SCHEDULED') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Published audience cannot change'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END; $$;
CREATE TRIGGER audience_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnnouncementAudience" FOR EACH ROW EXECUTE FUNCTION delta_audience_guard();
CREATE FUNCTION delta_notification_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'readAt') IS DISTINCT FROM (to_jsonb(OLD)-'readAt') THEN RAISE EXCEPTION 'Notification ownership and content immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER notification_history BEFORE UPDATE OR DELETE ON "Notification" FOR EACH ROW EXECUTE FUNCTION delta_notification_guard();
CREATE FUNCTION delta_subscription_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW."userId"<>OLD."userId" OR NEW."endpointHash"<>OLD."endpointHash" OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'Subscription ownership immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER subscription_history BEFORE UPDATE OR DELETE ON "PushSubscription" FOR EACH ROW EXECUTE FUNCTION delta_subscription_guard();
CREATE FUNCTION delta_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'attempts'-'lockedAt'-'nextAttemptAt'-'providerMessageId'-'lastError'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'attempts'-'lockedAt'-'nextAttemptAt'-'providerMessageId'-'lastError'-'updatedAt') OR OLD.status IN ('DELIVERED','ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN') THEN RAISE EXCEPTION 'Delivery identity or terminal outcome immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER delivery_history BEFORE UPDATE OR DELETE ON "NotificationDelivery" FOR EACH ROW EXECUTE FUNCTION delta_delivery_guard();
CREATE FUNCTION delta_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'SENDING' OR (to_jsonb(NEW)-'status'-'errorCode'-'providerMessageId'-'finishedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'errorCode'-'providerMessageId'-'finishedAt') THEN RAISE EXCEPTION 'Delivery attempts immutable after outcome'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER attempt_history BEFORE UPDATE OR DELETE ON "NotificationDeliveryAttempt" FOR EACH ROW EXECUTE FUNCTION delta_attempt_guard();
CREATE FUNCTION delta_ticket_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'assignedToId'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'assignedToId'-'updatedAt') THEN RAISE EXCEPTION 'Ticket identity immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT (
 (OLD.status='OPEN' AND NEW.status IN ('UNDER_REVIEW','IN_PROGRESS','WAITING_FOR_RESIDENT','RESOLVED','CLOSED')) OR
 (OLD.status='UNDER_REVIEW' AND NEW.status IN ('IN_PROGRESS','WAITING_FOR_RESIDENT','RESOLVED','CLOSED')) OR
 (OLD.status='IN_PROGRESS' AND NEW.status IN ('WAITING_FOR_RESIDENT','RESOLVED')) OR
 (OLD.status='WAITING_FOR_RESIDENT' AND NEW.status IN ('UNDER_REVIEW','IN_PROGRESS','RESOLVED','CLOSED')) OR
 (OLD.status='RESOLVED' AND NEW.status IN ('CLOSED','REOPENED')) OR
 (OLD.status='CLOSED' AND NEW.status='REOPENED') OR
 (OLD.status='REOPENED' AND NEW.status IN ('UNDER_REVIEW','IN_PROGRESS','WAITING_FOR_RESIDENT','RESOLVED','CLOSED'))
 ) THEN RAISE EXCEPTION 'Invalid ticket transition'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER ticket_history BEFORE UPDATE OR DELETE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION delta_ticket_guard();
CREATE FUNCTION delta_meeting_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW."authorId"<>OLD."authorId" OR NEW."createdAt"<>OLD."createdAt" OR OLD.status<>'SCHEDULED' THEN RAISE EXCEPTION 'Final meeting identity immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER meeting_history BEFORE UPDATE OR DELETE ON "Meeting" FOR EACH ROW EXECUTE FUNCTION delta_meeting_guard();
CREATE FUNCTION delta_participant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW."meetingId"<>OLD."meetingId" OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Participant identity immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER participant_history BEFORE UPDATE OR DELETE ON "MeetingParticipant" FOR EACH ROW EXECUTE FUNCTION delta_participant_guard();
CREATE FUNCTION delta_minutes_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE last_version INTEGER; finalized BOOLEAN; BEGIN
 PERFORM id FROM "Meeting" WHERE id=NEW."meetingId" FOR UPDATE;
 SELECT COALESCE(max(version),0),COALESCE(bool_or(status='FINAL'),false) INTO last_version,finalized FROM "MeetingMinutes" WHERE "meetingId"=NEW."meetingId";
 IF NEW.version<>last_version+1 OR (finalized AND length(trim(COALESCE(NEW."amendmentReason",'')))<3) THEN RAISE EXCEPTION 'Sequential amendment and reason required'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER minutes_version BEFORE INSERT ON "MeetingMinutes" FOR EACH ROW EXECUTE FUNCTION delta_minutes_version_guard();
CREATE FUNCTION delta_resolution_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE last_version INTEGER; finalized BOOLEAN; BEGIN
 PERFORM id FROM "Resolution" WHERE id=NEW."resolutionId" FOR UPDATE;
 SELECT COALESCE(max(version),0),COALESCE(bool_or(status<>'DRAFT'),false) INTO last_version,finalized FROM "ResolutionVersion" WHERE "resolutionId"=NEW."resolutionId";
 IF NEW.version<>last_version+1 OR (finalized AND length(trim(COALESCE(NEW."amendmentReason",'')))<3) THEN RAISE EXCEPTION 'Sequential resolution amendment and reason required'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER resolution_version BEFORE INSERT ON "ResolutionVersion" FOR EACH ROW EXECUTE FUNCTION delta_resolution_version_guard();
INSERT INTO "SmsTemplate"(key,category,content) VALUES
 ('general','general','پیام جدیدی در سامانه ساختمان دلتا دارید. برای مشاهده وارد سامانه شوید.'),
 ('financial','financial','اطلاع‌رسانی مالی جدید در سامانه ساختمان دلتا ثبت شد. برای مشاهده وارد سامانه شوید.'),
 ('meetings','meetings','اطلاع‌رسانی جلسه در سامانه ساختمان دلتا ثبت شد. برای مشاهده وارد سامانه شوید.'),
 ('tickets','tickets','وضعیت درخواست شما در سامانه ساختمان دلتا به‌روزرسانی شد.'),
 ('operational','operational','اطلاعیه عملیاتی مهم در سامانه ساختمان دلتا ثبت شد. لطفاً سامانه را بررسی کنید.'),
 ('security','security','اعلان امنیتی در سامانه ساختمان دلتا ثبت شد. لطفاً سامانه را بررسی کنید.');
CREATE FUNCTION delta_delivery_owner() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE recipient UUID; BEGIN
 SELECT "userId" INTO recipient FROM "Notification" WHERE id=NEW."notificationId";
 IF (NEW.channel='PUSH' AND NOT EXISTS(SELECT 1 FROM "PushSubscription" WHERE id=NEW."subscriptionId" AND "userId"=recipient)) OR (NEW.channel<>'PUSH' AND NEW."targetKey"<>recipient::text) THEN RAISE EXCEPTION 'Delivery target does not belong to recipient'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER delivery_owner BEFORE INSERT ON "NotificationDelivery" FOR EACH ROW EXECUTE FUNCTION delta_delivery_owner();
CREATE FUNCTION delta_sms_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'providerMessageId') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'providerMessageId') OR OLD.status IN ('ACCEPTED','SIMULATED','SKIPPED','FAILED','UNKNOWN') THEN RAISE EXCEPTION 'SMS target and terminal outcome immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER sms_history BEFORE UPDATE OR DELETE ON "SmsDelivery" FOR EACH ROW EXECUTE FUNCTION delta_sms_identity();
COMMIT;
