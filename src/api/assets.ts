import { existsSync, mkdirSync } from "fs";

import { cfg, type ApiConfig } from "../config";
import path from "path";
import { BadRequestError } from "./errors";
import { updateVideo, type Video } from "../db/videos";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function createDataUrl(mediaType: string, data: string) {
  return `data:${mediaType};base64,${data}`;
}

export function fileExtension(mediaType: string) {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpeg";
    // case "video/mp4":
    //   return "mp4";
    default:
      throw new BadRequestError(`mediatype '${mediaType}' not handled`);
  }
}

export function thumbnailLocalPath(fileName: string) {
  return path.join(cfg.assetsRoot, fileName);
}

export function thumbnailServePath(cfg: ApiConfig, fileName: string) {
  return `http://localhost:${cfg.port}/assets/${fileName}`;
}

export async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      `stream=width,height`,
      "-of",
      "json",
      filePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    }
  );

  await proc.exited;

  if (proc.exitCode) {
    const err = await new Response(proc.stderr).text();
    console.error("ffprobe error:", err);
    throw new Error(`ffprobe failed with exit code ${proc.exitCode}`);
  }

  const output = await new Response(proc.stdout).text();

  const data = JSON.parse(output);
  const streams = data.streams;

  if (!streams || streams.length === 0) {
    throw new Error("No video streams found");
  }

  const { height, width } = streams[0] as {
    height: number;
    width: number;
  };

  if (!width || !height) {
    throw new Error("Could not determine video dimensions");
  }

  const aspectRatio = width / height;

  // Common aspect ratios:
  // 16:9 = 1.778
  // 9:16 = 0.5625 (portrait)
  // 4:3 = 1.333
  // 1:1 = 1.0

  if (aspectRatio > 1.5) {
    return "landscape";
  } else if (aspectRatio < 0.75) {
    return "portrait";
  } else {
    return "other";
  }
}

export async function processVideoForFastStart(inputFilePath: string) {
  const splitPath = inputFilePath.split(".");
  const extension = splitPath.pop();

  const newFilePath = [...splitPath, "processed", extension].join(".");

  const proc = Bun.spawn([
    "ffmpeg",
    "-loglevel",
    "error",
    "-i",
    inputFilePath,
    "-movflags",
    "faststart",
    "-map_metadata",
    "0",
    "-codec",
    "copy",
    "-f",
    "mp4",
    newFilePath,
  ]);

  await proc.exited;

  return newFilePath;
}

// export function generatePresignedURL(
//   cfg: ApiConfig,
//   key: string,
//   expireTime: number = 3600
// ) {
//   return cfg.s3Client.presign(key, {
//     bucket: cfg.s3Bucket,
//     expiresIn: expireTime,
//   });
// }

// export async function dbVideoToSignedVideo(
//   cfg: ApiConfig,
//   video: Video
// ): Promise<Video> {
//   if (!video.videoURL) {
//     return video;
//   }
//   const presignedURL = await generatePresignedURL(cfg, video.videoURL);

//   video.videoURL = presignedURL;

//   return video;
// }
