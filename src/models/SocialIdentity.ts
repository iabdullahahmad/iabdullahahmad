import { Schema, model, models, type Model } from "mongoose";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./types";

export interface ISocialIdentity {
  platform: SocialPlatform;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes: string[];
}

const socialIdentitySchema = new Schema<ISocialIdentity>(
  {
    platform: {
      type: String,
      enum: SOCIAL_PLATFORMS,
      required: true,
      trim: true,
      index: true,
    },
    platformUserId: {
      type: String,
      required: true,
      trim: true,
    },
    accessToken: {
      type: String,
      required: true,
      trim: true,
    },
    refreshToken: {
      type: String,
      trim: true,
    },
    accessTokenExpiresAt: {
      type: Date,
    },
    refreshTokenExpiresAt: {
      type: Date,
    },
    scopes: {
      type: [String],
      required: true,
      default: [],
    },
  },
  {
    collection: "socialidentities",
    timestamps: true,
  },
);

socialIdentitySchema.index({ platform: 1 }, { unique: true });

export const SocialIdentityModel: Model<ISocialIdentity> =
  (models.SocialIdentity as Model<ISocialIdentity> | undefined) ??
  model<ISocialIdentity>("SocialIdentity", socialIdentitySchema);