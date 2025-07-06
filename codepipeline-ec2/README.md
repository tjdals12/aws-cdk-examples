# Elastic Beanstalk + RDS Stack (CDK)

## 📘 개요

- GithubSource or CodeStartConnectionSource를 통해 레포지토리 연결
- CodeBuild -> BuildSpec 기반 빌드
- CodeDeploy -> EC2 태그 기반 배포
- CodePipeline -> 전체 CI/CD 연결
- Secrets Manager -> GithubSource 사용 시 GitHub 토큰 관리

## 리소스 구성

- GithubSource or CodeStartConnectionSource
- CodeBuild
- CodeDeploy
- Secrets Manager
- EC2

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

### 애플리케이션 구조

애플리케이션은 다음과 같은 구조를 가져야 함.

```
├── src/
├── package.json
├── buildspec.yml
├── appspec.yml
└── ecosystem.config.js (pm2 사용)
```

### Source Action - GitHubSourceAction

GitHubSourceAction은 AWS CodePipeline에서 GitHub 저장소로부터 소스 코드를 가져오는 데 사용하는 액션이다. GitHub에 인증하기 위한 Personal Access Token이 필요하며, 여기서는 Secrets Manager에 저정해서 사용한다.

```typescript
const sourceOutput = new codepipeline.Artifact("SourceArtf");
const sourceAction = new codepipelineActions.GitHubSourceAction({
  output: sourceOutput,
  actionName: "my-project-source",
  owner: "tjdals12", // GitHub 계정
  repo: "my-project", // Github 저장소
  branch: "main", // 대상 브랜치
  oauthToken: secretsmanager.Secret.fromSecretNameV2(
    this,
    "GithubToken",
    "github-token"
  ).secretValue,
  trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
});
```

### Source Action - CodeStarConnectionsSourceAction

CodeStarConnectionsSourceAction은 GitHub 저장소를 AWS CodeStar 연결을 통해 연동하는 방식이다. AWS 콘솔에서 수동으로 생성한 CodeStar 연결을 ARN으로 참조한다.

```typescript
const sourceOutput = new codepipeline.Artifact("SourceArtf");
const sourceAction = new codepipelineActions.CodeStarConnectionsSourceAction({
  output: sourceOutput,
  actionName: "my-project-source",
  owner: "tjdals12", // GitHub 계정
  repo: "my-project", // GitHub 저장소
  branch: "main", // 대상 브랜치
  connectionArn: codeStarConnectionArn,
});
```
