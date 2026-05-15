import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, adminQuery } from "../middleware";
import { listImages, processUpload } from "../lib/images";
import { deleteImage } from "../lib/imageDelete";

const HASH_INPUT = z.string().regex(/^[0-9a-f]{16}$/);

export const uploadRouter = createRouter({
  // Upload a new image. Body is base64-encoded binary; the tRPC body limit
  // (50 MB on bodyLimit in boot.ts) gates the raw request, and processUpload
  // enforces the decoded byte cap (UPLOAD_MAX_BYTES, default 10 MB).
  image: adminQuery
    .input(
      z.object({
        dataBase64: z.string().min(1).max(20 * 1024 * 1024), // base64 string cap
        origName: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let buf: Buffer;
      try {
        buf = Buffer.from(input.dataBase64, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64" });
      }
      return processUpload(buf, {
        origName: input.origName,
        userId: ctx.user.id,
      });
    }),

  list: adminQuery.query(() => listImages()),

  delete: adminQuery
    .input(z.object({ hash: HASH_INPUT }))
    .mutation(({ input }) => deleteImage(input.hash)),
});
