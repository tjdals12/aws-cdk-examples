# Elastic Beanstalk + RDS Stack (CDK)

## 📘 개요

- VPC 구성 (Public + Private Subnet)
- Bastion Host는 Public Subnet에 배치되어 SSH 접속을 허용
- Aurora Serverless v2 (PostgreSQL)는 Private Subnet에 생성
- Bastion Host를 통해서만 Aurora에 접근 가능하도록 보안 그룹 구성

## 리소스 구성

- VPC
- EC2
- Security Group
- IAM Role
- Aurora Serverless

## 배포

```bash
npm install
cdk bootstrap
cdk deploy --all
```

## 리소스 삭제

```bash
cdk destroy --all
```

## etc.

### Aurora Serverless V2 설정

#### serverlessV2MinCapacity

클러스터가 자동 확장을 시작할 최소 처리 용량. 단위는 ACU이며, 0.5 단위로 설정할 수 있음.

\*_V2 버전부터는 최소 처리 용량을 0으로 설정할 수 있음. 0으로 설정하면 일정 기간 동안 비활성 상태가 되면 자동으로 일시 중지됨._

#### serverlessV2MaxCapacity

클러스터가 자동 확장으로 도달할 수 있는 최대 처리 용량. 단위는 ACU이며, 0.5 단위로 설정할 수 있음.

#### defaultDatabaseName

클러스터가 생성될 때 자동으로 생성되는 기본 데이터베이스 이름

#### writer

클러스터에 연결되는 쓰기 전용 인스턴스 설정

### readers

클러스터에 연결되는 읽기 전용 인스턴스 설정

#### removalPolicy

클러스터와 인스턴스가 스택에서 제거되거나 업데이트 중 교체될 때 데이터를 어떻게 처리할지를 결정함.

- RemovalPolicy.SNAPSHOT: (기본값) 리소스를 삭제하되, 데이터 스탭샷을 보존함.
- RemovalPolicy.DESTROY: 클러스터와 데이터를 모두 삭제함. (스냅샷 없음)
- RemovalPolicy.RETAIN: 클러스터와 데이터를 그대로 유지함. 필요한 경우, 수동으로 삭제해야 함.

### Aurora Serverless 퍼블릭 엑세스

서브넷 그룹에 퍼블릭 서브넷을 할당한다.

```typescript
const rdsSubnetGroup = new rds.SubnetGroup(this, "RDSSubnetGroup", {
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
  description: "RDS private subnet group",
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

Writer 또는 Reader 인스턴스의 publicAccessible 설정을 활성화한다.

```typescript
const writerInstance = cluster.node.findChild("my-database-writer").node
  .defaultChild as rds.CfnDBInstance;
writerInstance.publiclyAccessible = true;
```
