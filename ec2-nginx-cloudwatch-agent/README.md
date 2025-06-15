# EC2 + Nginx + CloudWatch Agent (CDK)

## 개요

- 퍼블릭 VPC에 EC2 인스턴스 1대 생성
- EC2에는 Nginx 설치 및 설정
- CloudWatch Agent 설치 및 설정

## 리소스 구성

- EC2
- VPC
- Security Group
- IAM Role
- Nginx
- CloudWatch Agent

## 배포

```bash
npm install
cdk bootstrap
cdk deploy --context ssh-ip="$(curl -s https://checkip.amazonaws.com)/32" --context key-pair-name="my-keypair"
```

## 리소스 삭제

```bash
cdk destroy --context ssh-ip="$(curl -s https://checkip.amazonaws.com)/32" --context key-pair-name="my-keypair"
```

## etc.

### 1. AMI 선택

AWS CLI를 사용하여 사용 가능한 이미지 검색

```bash
$ aws ec2 describe-images \
--owners 099720109477 \
--filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-*" \
--query "Images[*].{ID:ImageId}" \
--output table
```

CDK 코드에서 이미지 변경

```typescript
const machineImage = ec2.MachineImage.genericLinux({
  "ap-northeast-2": "ami-09ed9bca6a01cd74a",
});
```

### 2. 사용자 데이터 설정

🔹 (1) 인라인 문자열로 직접 추가

```typescript
instance.userData.addCommands(
  `#!/bin/bash
yum update -y
yum install -y nginx

# overwrite
cat > /etc/nginx/sites-available/default <<EOF
server {
    listen 80;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

systemctl restart nginx
`
);
```

🔹 (2) 로컬 스크립트 파일을 읽어서 전달

```typescript
const userDataScript = fs.readFileSync(
  path.resolve(__dirname, "../assets/setup-nginx.sh"),
  "utf-8"
);
instance.addUserData(userDataScript);
```

🔹 (3) S3 Asset으로 업로드 후 실행

```typescript
const setupNginxScript = new s3Assets.Asset(this, "SetupNginxAsset", {
  path: path.resolve(__dirname, "../assets/setup-nginx.sh"),
});
const setupNginxScriptPath = instance.userData.addS3DownloadCommand({
  bucket: setupNginxScript.bucket,
  bucketKey: setupNginxScript.s3ObjectKey,
});
instance.userData.addExecuteFileCommand({
  filePath: setupNginxScriptPath,
});
setupNginxScript.grantRead(role);
```
