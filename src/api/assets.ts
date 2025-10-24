import { existsSync, mkdirSync } from "fs";

import { cfg, type ApiConfig } from "../config";
import path from "path";
import { BadRequestError } from "./errors";

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
    case "video/mp4":
      return "mp4";
    default:
      throw new BadRequestError(`mediatype '${mediaType}' not handled`);
  }
}

export function thumbnailLocalPath(fileName: string) {
  return path.join(cfg.assetsRoot, fileName);
}

export function thumbnailServePath(
  cfg: ApiConfig,
  videoID: string,
  fileExtension: string
) {
  return `http://localhost:${cfg.port}/assets/${videoID}.${fileExtension}`;
}
