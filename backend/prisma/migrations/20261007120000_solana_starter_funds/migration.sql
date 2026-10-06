-- Starter funds for freshly linked wallets on localnet/devnet, handed out once per wallet.
ALTER TABLE "Wallet" ADD COLUMN "starterFundedAt" TIMESTAMP(3);
