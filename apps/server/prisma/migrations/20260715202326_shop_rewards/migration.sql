-- CreateTable
CREATE TABLE "coin_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "price_vnd" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "coin_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_checkins" (
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "streak" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,

    CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateIndex
CREATE INDEX "coin_orders_user_id_idx" ON "coin_orders"("user_id");

-- AddForeignKey
ALTER TABLE "coin_orders" ADD CONSTRAINT "coin_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

