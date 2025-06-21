# EC2 + RDS (PostgreSQL) Stack (CDK)

## 개요

- 퍼블릭 서브넷에 EC2 인스턴스 1대 생성
- 프라이빗 서브넷에 PostgreSQL RDS 인스턴스 1대 생성
- EC2는 S3에 업로드된 shell 스크립트를 받아 Node.js 환경 구성
- EC2에서 RDS에 접근할 수 있도록 보안 그룹 구성

## 리소스 구성

- EC2
- VPC
- RDS (Postgres)
- Security Group
- IAM Role

## 배포

```bash
npm install
cdk bootstrap
cdk deploy --context ssh-ip="$(curl -s https://checkip.amazonaws.com)/32" --context key-pair-name="your-keypair-name"
```

## 리소스 삭제

```bash
cdk destroy --context ssh-ip="$(curl -s https://checkip.amazonaws.com)/32" --context key-pair-name="my-keypair"
```

## etc.

### 1. RDS 옵션

engine: 데이터베이스 엔진 설정

```typescript
engine: rds.DatabaseInstanceEngine.postgres({
  version: rds.PostgresEngineVersion.VER_16_8,
}),
```

multiAZ: 고가용성을 위한 다중 리전 배포 설정

```typescript
multiAZ: true;
```

credentials: 마스터 계정 설정

```typescript
// 지정된 사용자명으로 비밀번호를 자동 생성하고 AWS Secrets Manager에 저장
credentials: rds.Credentials.fromGeneratedSecret("postgres"),

// 사용자명과 비밀번호를 직접 지정
credentials: rds.Credentials.fromPassword(
      "postgres",
      cdk.SecretValue.unsafePlainText("postgres")
    ),

// 이미 생성된 Secret Manager 사용
credentials: rds.Credentials.fromSecret(
    secretManager.Secret.fromSecretNameV2(
    this,
    "MyRdsSecret",
    "my-rds-secret"
    )
);

// 비밀번호 없이 사용자명만 지정
credentials: rds.Credentials.fromGeneratedSecret("postgres"),
```

allocatedStorage: 초기 디스크 크기(GB) 지정

```typescript
allocatedStorage: 20;
```

maxAllocatedStorage: 자동으로 확장할 수 있는 최대 디스크 크기, 설정하지 않으면 자동으로 확장하지 않음.

```typescript
maxAllocatedStorage: 100;
```

publiclyAccessible: RDS 인스턴스에 퍼블릭 IP 주소를 부여할지 여부

```typescript
publiclyAccessible: false;
```

2. VPC 옵션

maxAzs: 생성할 가용 영역의 수

```typescript
maxAzs: 2;
```

natGateways: 퍼블릭 서브넷에 생성할 NAT Gateway의 수, 기본값은 가용 영역마다 1개씩 생성함.

```typescript
natGateways: 1;
```

subnetConfiguration: 어떤 타입의 서브넷을 생성할지

```typescript
subnetConfiguration: [
  // 퍼블릭 IP를 가질 수 있고 인터넷 게이트웨이로 직접 통신이 가능한 서브넷
  { name: "public", subnetType: ec2.SubnetType.PUBLIC },

  // 퍼블릭 IP는 없지만 NAT Gateway를 통해 외부로 나갈 수 있는 서브넷
  // 이 서브넷의 라우팅 테이블에는 0.0.0.0/0 → NAT Gateway 경로가 포함됨
  { name: "private_1", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },

  // 퍼블릭 IP도 없고 NAT Gateway도 없어 완전히 고립된 서브넷
  // 이 서브넷의 라우팅 테이블에는 외부로 나가는 경로(0.0.0.0/0)가 없음
  { name: "private_2", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
],
```
