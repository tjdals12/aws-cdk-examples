# Elastic Load Balancer + EC2 + Route53 (CDK)

## 📘 개요

- 퍼블릭 서브넷을 가진 VPC 생성
- EC2 인스턴스 1대 생성 (Amazon Linux 2023 + Nginx 설치)
- ALB(Application Load Balancer)를 퍼블릭에 생성하고 EC2 인스턴스를 대상으로 연결
- Route53을 통해 도메인 연결
- EC2에는 Nginx 설치 및 설정정

## 리소스 구성

- EC2
- VPC
- Security Group
- IAM Role
- ALB + Target Group + Listener
- Nginx

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

### 리스너 등록

🔹 (1) TargetGroup을 먼저 만들고 Listener에 연결

- Target Group

```typescript
const albTargetGroup = new elbv2.ApplicationTargetGroup(
  this,
  "ALBTargetGroup",
  {
    vpc,
    port: 80,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targetType: elbv2.TargetType.INSTANCE,
    healthCheck: {
      path: "/",
      healthyHttpCodes: "200",
    },
  }
);
albTargetGroup.addTarget(new elbv2Targets.InstanceTarget(ec2Instance));

const albListener = alb.addListener("Listener", {
  port: 80,
  protocol: elbv2.ApplicationProtocol.HTTP,
  open: true,
});
albListener.addTargetGroups("DefaultTargetGroup", {
  targetGroups: [albTargetGroup],
});
```

🔹 (2) Listener에 직접 Target 등록

```typescript
const albListener = alb.addListener("Listener", {
  protocol: elbv2.ApplicationProtocol.HTTP,
  port: 80,
  open: true,
});
albListener.addTargets("Ec2Target", {
  protocol: elbv2.ApplicationProtocol.HTTP,
  port: 80,
  targets: [new elbv2Targets.InstanceTarget(ec2Instance)],
  healthCheck: {
    path: "/",
    healthyHttpCodes: "200",
  },
});
```
