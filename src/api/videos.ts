import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import path from "path";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from "crypto";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;

  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to delete this video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("video file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Thumbnail file exceeds the maximum allowed size of 10MB`
    );
  }

  if (file.type !== "video/mp4") {
    throw new BadRequestError("not a video mp4 file");
  }

  // Save the uploaded file to a temporary file on disk.
  // Put the object into S3 using S3Client.file(). You'll need to provide:
  const fileName = `${randomBytes(32).toString("hex")}.mp4`;
  const localFilePath = path.join("./tmp", fileName);
  await Bun.write(localFilePath, file);

  try {
    const bunFile = Bun.file(localFilePath);
    const bucketFile = cfg.s3Client.file(fileName, {
      bucket: cfg.s3Bucket,
    });
    await bucketFile.write(bunFile, {
      type: file.type,
    });

    // Update the VideoURL of the video record in the database with the S3 bucket and key.
    const s3Url = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${fileName}`;

    video.videoURL = s3Url;
    updateVideo(cfg.db, video);

    return respondWithJSON(200, video);
  } finally {
    // Remember to remove the temp file when the process finishes.
    await Bun.file(localFilePath).delete();
  }
}
