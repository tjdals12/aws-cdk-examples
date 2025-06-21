# Elastic Beanstalk + RDS Stack (CDK)

## 📘 개요

- VPC 구성 (Public + Private Subnet)
- Elastic Beanstalk 환경 생성 (ALB + EC2)
- S3 Asset과 zip 파일을 통해 Node.js 앱 배포
- RDS (PostgreSQL) 프로비저닝

## 리소스 구성

- VPC
- Beanstalk (ALB + EC2)
- Security Group
- IAM Role
- Nginx
- RDS

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

### 애플리케이션 구조

압축된 app.zip 파일은 다음과 같은 구조를 가져야 함.

```bash
app.zip
├── package.json
├── index.js
└── Procfile
```

package.json

```json
{
  "scripts": {
    "start": "node index.js"
  }
}
```

index.js

```javascript
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;

app.get("/", (_, res) => res.send("Hello from Beanstalk!"));

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

Procfile

```bash
web: npm start
```

### Beanstalk 설정

#### VPC 설정

```typescript
// VPC 설정
{
    namespace: "aws:ec2:vpc",
    optionName: "VPCId",
    value: vpc.vpcId,
},
// EC2 인스턴스가 배포될 서브넷
// 퍼블릭 서브넷에 배포하면 자동으로 퍼블릭 IP를 할당함.
{
    namespace: "aws:ec2:vpc",
    optionName: "Subnets",
    value: vpc.privateSubnets
        .map((subnet) => subnet.subnetId)
        .join(","),
},
// ALB가 배포될 서브넷
{
    namespace: "aws:ec2:vpc",
    optionName: "ELBSubnets",
    value: vpc.publicSubnets.map((subnet) => subnet.subnetId).join(","),
},
```

#### EC2 인스턴스 설정

```typescript
// 인스턴스 프로파일
{
    namespace: "aws:autoscaling:launchconfiguration",
    optionName: "IamInstanceProfile",
    value: instanceProfile.ref,
},
// 인스턴스 크기
{
    namespace: "aws:autoscaling:launchconfiguration",
    optionName: "InstanceType",
    value: "t2.micro",
},
// 인스턴스의 보안그룹
// 보안그룹을 지정하지 않아도 Beanstalk에서 자동으로 생성해서 할당함
{
    namespace: "aws:autoscaling:launchconfiguration",
    optionName: "SecurityGroups",
    value: instanceSecurityGroup.securityGroupId,
},
// 키페어
{
    namespace: "aws:autoscaling:launchconfiguration",
    optionName: "EC2KeyName",
    value: "my-project-dev",
},
// EC2 인스턴스의 보안 그룹에 SSH 인바운드 규칙을 추가
// 이 값을 지정하지 않으면 SSH를 퍼블릭으로 설정함.
{
    namespace: "aws:autoscaling:launchconfiguration",
    optionName: "SSHSourceRestriction",
    value: `tcp, 22, 22, ${sshIp}`,
},
```

#### 로드밸런서 설정

```typescript
// Beanstalk 환경 유형
// SingleInstance: 단일 인스턴스
// LoadBalanced: 로드밸런싱
{
    namespace: "aws:elasticbeanstalk:environment",
    optionName: "EnvironmentType",
    value: "LoadBalanced",
},
{
    namespace: "aws:autoscaling:asg",
    optionName: "MinSize",
    value: "1",
},
{
    namespace: "aws:autoscaling:asg",
    optionName: "MaxSize",
    value: "4",
},
// Beanstalk이 자동으로 생성/관리하는 보안 그룹을 대체
{
    namespace: "aws:elb:loadbalancer",
    optionName: "ManagedSecurityGroup",
    value: albSecurityGroup.securityGroupId,
},
// 사용자 지정 보안 그룹 추가
// Beanstalk이 자동으로 생성하는 보안 그룹을 대체한 경우, 이 값을 지정하지 않으면 VPC의 기본 보안그룹이 추가됨.
{
    namespace: "aws:elb:loadbalancer",
    optionName: "SecurityGroups",
    value: albSecurityGroup.securityGroupId,
},
// ALB가 클라이언트 요청을 수신할 때 사용할 프로토콜
{
    namespace: "aws:elb:listener",
    optionName: "ListenerProtocol",
    value: "HTTP",
},
// ALB가 리스닝할 포트 번호
{
    namespace: "aws:elb:loadbalancer",
    optionName: "LoadBalancerHTTPPort",
    value: "80",
},
// 인스턴스에 트래픽을 전달할 때 사용할 프로토콜
{
    namespace: "aws:elb:listener",
    optionName: "InstanceProtocol",
    value: "HTTP",
},
// 인스턴스에 트래픽을 포워딩할 포트 번호
{
    namespace: "aws:elb:listener",
    optionName: "InstancePort",
    value: "80",
},
```

#### 환경변수 설정

```typescript
{
    namespace: "aws:elasticbeanstalk:application:environment",
    optionName: "PORT",
    value: "8080",
},
```
