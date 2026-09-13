-- This is an empty migration.-- A user can hold at most one ACTIVE membership at a time (joining another venue ends the previous one).
CREATE UNIQUE INDEX "Membership_one_active_per_user" ON "Membership"("userId") WHERE "status" = 'ACTIVE';
