-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "exercises_catalog" (
    "id" UUID NOT NULL,
    "canonical_name" VARCHAR(150) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "primary_muscle_group" VARCHAR(50) NOT NULL,
    "aliases" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exercises_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_entries" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(128) NOT NULL,
    "exercise_name" VARCHAR(150) NOT NULL,
    "exercise_name_norm" VARCHAR(150) NOT NULL,
    "exercise_catalog_id" UUID,
    "muscle_group" VARCHAR(50),
    "performed_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL,
    "workout_entry_id" UUID NOT NULL,
    "user_id" VARCHAR(128) NOT NULL,
    "exercise_name_norm" VARCHAR(150) NOT NULL,
    "performed_at" TIMESTAMPTZ NOT NULL,
    "set_number" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "original_weight" DECIMAL(8,2) NOT NULL,
    "original_unit" VARCHAR(10) NOT NULL,
    "weight_kg" DECIMAL(10,4) NOT NULL,
    "volume_kg" DECIMAL(12,4) NOT NULL,
    "estimated_1rm_kg" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercises_catalog_canonical_name_key" ON "exercises_catalog"("canonical_name");

-- CreateIndex
CREATE INDEX "idx_entries_user_performed_id" ON "workout_entries"("user_id", "performed_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_entries_user_muscle_date" ON "workout_entries"("user_id", "muscle_group", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_entries_exercise_trgm" ON "workout_entries" USING GIN ("exercise_name_norm" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "workout_entries_user_id_idempotency_key_key" ON "workout_entries"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_sets_pr_lookup" ON "workout_sets"("user_id", "exercise_name_norm", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_sets_entry_fk" ON "workout_sets"("workout_entry_id", "set_number" ASC);

-- AddForeignKey
ALTER TABLE "workout_entries" ADD CONSTRAINT "workout_entries_exercise_catalog_id_fkey" FOREIGN KEY ("exercise_catalog_id") REFERENCES "exercises_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_entry_id_fkey" FOREIGN KEY ("workout_entry_id") REFERENCES "workout_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
