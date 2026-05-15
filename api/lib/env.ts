import "dotenv/config";

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  get adminSetupToken() {
    return process.env.ADMIN_SETUP_TOKEN?.trim() || "";
  },
};
