# DMS - RDS to Aurora Serverless (CDK)

## 📘 개요

이 스택은 RDS를 소스 데이터베이스로, Aurora Serverless를 타깃 데이터베이스로 설정하고, DMS(Database Migration Service)를 활용해 전체 데이터 로드 및 변경 데이터 캡처(CDC)를 수행합니다.

## 리소스 구성

- DMS Replication Instance : 마이그레이션 작업을 수행하는 인스턴스
- DMS Endpoints : DMS가 소스와 타깃 데이터베이스에 연결할 수 있도록 구성하는 메타 데이터
- Replication Task : 실제 데이터 복제를 수행하는 작업 단위, 전체 로드 또는 변경 데이터 캡처 방식을 설정할 수 있음,
- RDS (Postgres) : 기존 데이터를 보유한 소스 데이터베이스
- Aurora Serverless (Postgres) : 데이터가 복제될 대상 데이터베이스

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

### CDC를 위한 파라미터 설정

DMS에서 변경 데이터 캡처(CDC)를 사용하기 위해서는 RDS 및 Aurora 인스턴스의 파라미터 그룹에 다음과 같은 설정이 필요합니다. **(이 설정은 소스 및 타깃 데이터베이스 모두에 적용해야 하며, 변경 후에는 인스턴스 재시작이 필요합니다.)**

```typescript
parameters: {
    "rds.logical_replication": "1",
    session_replication_role: "replica",
    shared_preload_libraries: "pg_stat_statements,pg_tle,pglogical",
},
```

`rds.logical_replication` : RDS에서 CDC 기능을 사용할 수 있도록 logical replication 활성화
`session_replication_role` : replica로 설정하면 트리거나 제약 조건을 무시하고 복제 작업 수행 가능
`shared_preload_libraries` : pglogical 등 확장 기능을 PostgreSQL 시작 시 로드하도록 설정

### pglogical 확장 설치

PostgreSQL 기반의 CDC(Change Data Capture)를 사용하려면 pglogical 확장 설치가 필수입니다.
파라미터 그룹에 관련 설정을 추가하더라도, 초기 활성화는 직접 DB에 접속해 수동으로 실행해야 합니다.

```bash
$ CREATE EXTENSION pglogical;
$ SELECT * FROM pg_catalog.pg_extension;
```

### 배포 후 마이그레이션 전 평가 수동으로 실행

CDK에서는 Replication Task를 생성하더라도 마이그레이션 전 평가(Assessment) 또는 실행(Start) 을 자동으로 시작할 수 없습니다. 따라서 스택 배포 이후, AWS Console 또는 CLI를 통해 수동으로 평가를 생성하고 실행해야 합니다.

### Replication Task 실행

pglogical 확장 설치 및 마이그레이션 평가가 완료되면, Replication Task를 수동으로 실행할 수 있습니다. AWS Console 또는 CLI를 통해 수동으로 Task를 실행해야 합니다.

### 트러블 슈팅

#### 1. Replication Instance에서 Secret Manager에 엑세스할 수 없을 때

원인 : Replication Instance를 생성하고 엔드포인트와 연결 테스트를 했을 때 발생한 문제로, 메시지만 보면 Secret Manager에 접근할 수 없기 때문에 권한 문제가 생각했지만, Replication Instance에 지정한 보안 그룹에 아웃바운드 규칙이 정의되어 있지 않아서 Secret Manager API의 호출이 불가능해서 발생한 문제였습니다.

해결 : 해당 보안 그룹에 아웃바운드 규칙을 추가하여 해결했습니다.

```
Test Endpoint failed: Application-Status: 1020912, Application-Message: Failed to build connection string Unable to find Secrets Manager secret, Application-Detailed-Message: Failed to retrieve secret. Unable to find AWS Secrets Manager secret Arn 'arn:aws:secretsmanager:ap-northeast-2:<ACCOUNT_ID>:secret:<RDS_STACK_NAME>' The secrets_manager get secret value failed: curlCode: 28, Timeout was reached Too many retries: curlCode: 28, Timeout was reached Additional info: Read timed out
```

#### 2. 마이그레이션 전 평가 항목 실패 - Validate if table has Primary Key or Unique Index when data validation is enabled for DMS task

원인 : 일부 테이블에서 Primary Key나 Unique Index를 찾을 수 없어서 발생하는 에러로, 보통 마이그레이션 규칙에 모든 스키마와 테이블을 지정할 경우 발생합니다.

해결 : 마이그레이션이 필요한 스키마만 필터링 하도록 변경하여 해결했습니다.

#### 3. 마이그레이션 전 평가 항복 실패 - Kindly set database parameter shared_preload_libraries = pglogical and create extension pglogical in your PostgreSQL Source database, Refer to the following link for more information

원인 : RDS의 파라미터 그룹에 CDC를 위한 설정이 되어 있지 않아서 발생하는 에러입니다.

해결 : (1) 파라미터 그룹의 rds.logical_replication을 1로 설정하고, shared_preload_libraries에 pglogical을 추가합니다. (2) 변경된 파라미터 그룹을 적용하기 위해서 인스턴스를 재시작합니다. (3) 데이터베이스에 접속하여 pglogical 확장을 설치합니다.

#### 4. LOB(대형 객체)가 사용되었지만 대상 LOB 열은 null 값을 사용할 수 없습니다

원인 : LOB(text, bytea, json 등) 타입의 컬럼에 NOT NULL 제약이 설정되어 있는 경우, DMS 마이그레이션 중 해당 컬럼에 값을 쓰지 못해 오류가 발생합니다.
이는 DMS가 LOB 데이터를 INSERT 시점에 함께 넣는 것이 아니라, 먼저 해당 열에 NULL을 삽입한 후, 나중에 별도 스트리밍 방식으로 UPDATE 하기 때문입니다.

```
DMS는 마이그레이션 처리 속도를 높이고, 네트워크 지연이나 메모리 부족 등으로 인한 오류를 줄이기 위해, LOB 데이터를 일반 컬럼과 분리해 스트리밍 방식으로 전송합니다.
이로 인해 레코드 생성 시 해당 LOB 컬럼은 일단 NULL로 삽입되고, 이후 DMS가 별도로 해당 컬럼에 실제 데이터를 UPDATE하는 방식으로 처리됩니다.
```

해결 :

1. Full LOB mode를 사용합니다. 하지만, 이 모드는 모든 LOB 데이터를 전체 크기 그대로 한 번에 가져와 처리하기 때문에, 마이그레이션 중 처리 속도가 느려질 수 있고, 메모리 사용량이 급증하거나 네트워크 지연의 영향을 더 크게 받을 수 있기 때문에 Replication Instance와 소스 및 타깃 데이터베이스 인스턴스의 타입을 상향 조정해야 합니다.

```
Full LOB mode로 설정해도 마이그레이션 전 평가에서 해당 항목은 여전히 통과되지 않지만, 태스크를 실행하면 마이그레이션 잘 진행됩니다.
```

2. Limited LOB mode를 사용하려면, 모든 테이블의 LOB 타입 컬럼을 NULLABLE로 변경합니다.
