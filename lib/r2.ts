import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

function client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId(),
      secretAccessKey: env.r2SecretAccessKey(),
    },
  });
}

export async function presignUpload(key: string, contentType: string) {
  return getSignedUrl(client(), new PutObjectCommand({
    Bucket: env.r2BucketName(),
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });
}

export async function presignDownload(key: string, expiresIn = 300) {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: env.r2BucketName(),
    Key: key,
  }), { expiresIn });
}

export async function headObject(key: string) {
  return client().send(new HeadObjectCommand({ Bucket: env.r2BucketName(), Key: key }));
}

export async function deleteObject(key: string) {
  return client().send(new DeleteObjectCommand({ Bucket: env.r2BucketName(), Key: key }));
}
