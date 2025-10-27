import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import path from "path";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from "crypto";
import { getVideoAspectRatio, processVideoForFastStart } from "./assets";

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

  const aspectRatio = await getVideoAspectRatio(localFilePath);
  const newFilePath = await processVideoForFastStart(localFilePath);
  const keyWithPrefix = `${aspectRatio}/${fileName}`;

  try {
    const bunFile = Bun.file(newFilePath);
    const bucketFile = cfg.s3Client.file(keyWithPrefix, {
      bucket: cfg.s3Bucket,
    });
    await bucketFile.write(bunFile, {
      type: file.type,
    });

    // Update the VideoURL of the video record in the database with just the key
    video.videoURL = `${cfg.s3CfDistribution}/${keyWithPrefix}`;
    updateVideo(cfg.db, video);

    // Convert to signed video for response
    // const newVideo = await dbVideoToSignedVideo(cfg, video);

    return respondWithJSON(200, video);
  } finally {
    // Remember to remove the temp file when the process finishes.
    await Bun.file(localFilePath).delete();
    await Bun.file(newFilePath).delete();
  }
}
