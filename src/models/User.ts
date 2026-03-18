import { Schema, model, models, type Model } from "mongoose";

export const USER_SINGLETON_KEY = "MASTER_ADMIN_CONFIGURATION" as const;

export interface IUser {
  singletonKey: typeof USER_SINGLETON_KEY;
}

const userSchema = new Schema<IUser>(
  {
    singletonKey: {
      type: String,
      required: true,
      default: USER_SINGLETON_KEY,
      enum: [USER_SINGLETON_KEY],
      unique: true,
      immutable: true,
      trim: true,
    },
  },
  {
    collection: "users",
    timestamps: true,
  },
);

export const UserModel: Model<IUser> =
  (models.User as Model<IUser> | undefined) ?? model<IUser>("User", userSchema);