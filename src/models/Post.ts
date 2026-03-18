import { Schema, model, models, type Model } from "mongoose";
import { POST_STATUSES, SOCIAL_PLATFORMS, type PostStatus, type SocialPlatform } from "./types";

export interface IPost {
  content: string;
  mediaUrls: string[];
  targetPlatforms: SocialPlatform[];
  scheduledExecutionTime: Date;
  status: PostStatus;
}

const postSchema = new Schema<IPost>(
  {
    content: {
      type: String,
      required: true,
      trim: true,
    },
    mediaUrls: {
      type: [String],
      required: true,
      default: [],
    },
    targetPlatforms: {
      type: [
        {
          type: String,
          enum: SOCIAL_PLATFORMS,
          required: true,
        },
      ],
      required: true,
      validate: {
        validator: (value: SocialPlatform[]) => Array.isArray(value) && value.length > 0,
        message: "At least one target platform must be selected.",
      },
    },
    scheduledExecutionTime: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: POST_STATUSES,
      required: true,
      default: "DRAFT",
      index: true,
    },
  },
  {
    collection: "posts",
    timestamps: true,
  },
);

postSchema.index({ status: 1, scheduledExecutionTime: 1 });

export const PostModel: Model<IPost> =
  (models.Post as Model<IPost> | undefined) ?? model<IPost>("Post", postSchema);