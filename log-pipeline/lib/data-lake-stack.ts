import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as glue from "aws-cdk-lib/aws-glue";

export interface DataLakeStackProps extends cdk.StackProps {
  project: string;
  stage: string;
}

export class DataLakeStack extends cdk.Stack {
  readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: DataLakeStackProps) {
    super(scope, id, props);

    const { project, stage } = props;
    const projectStage = `${project}-${stage}`;

    const dataLakeBucket = new s3.Bucket(this, "data-lake-bucket", {
      bucketName: `${projectStage}-data-lake`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          // 완료되지 않은 멀티 파트 업로드
          id: "abort-mpu-7d",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          // 만료된 삭제 마커 정리 (삭제 마커가 있고, 이전 버전이 존재하지 않는 오브젝트)
          id: "cleanup-expired-delete-markers",
          expiredObjectDeleteMarker: true,
        },
        {
          // bronze에 있는 오브젝트를 대상
          id: "bronze-coldline",
          prefix: "bronze/",
          // 기간에 따라 스토리지 클래스 변경
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(180),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
          // 과거 버전을 30일 후 지정 스토리지 클래스로 전환
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
          // 과거 버전을 90일 후 영구 삭제
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          // silver에 있는 오브젝트를 대상
          id: "silver-noncurrent-expire",
          prefix: "silver/",
          // 과거 버전을 60일 후 영구 삭제
          noncurrentVersionExpiration: cdk.Duration.days(60),
        },
      ],
    });

    const catalogId = this.account;
    const s3Url = dataLakeBucket.s3UrlForObject();

    const bronzeDatabase = new glue.CfnDatabase(this, "bronze-database", {
      catalogId,
      databaseInput: {
        name: `${projectStage}-bronze`,
        locationUri: `${s3Url}/bronze`,
        parameters: { project, stage, tier: "bronze" },
      },
    });

    const silverDatabase = new glue.CfnDatabase(this, "silver-database", {
      catalogId,
      databaseInput: {
        name: `${projectStage}-silver`,
        locationUri: `${s3Url}/silver`,
        parameters: { project, stage, tier: "silver" },
      },
    });

    const goldDatabase = new glue.CfnDatabase(this, "gold-database", {
      catalogId,
      databaseInput: {
        name: `${projectStage}-gold`,
        locationUri: `${s3Url}/gold`,
        parameters: { project, stage, tier: "gold" },
      },
    });

    bronzeDatabase.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    silverDatabase.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    goldDatabase.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    this.bucket = dataLakeBucket;
  }
}
