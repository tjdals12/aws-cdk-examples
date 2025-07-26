import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ecr from "aws-cdk-lib/aws-ecr";

export interface EcrStackProps extends cdk.StackProps {
  projectPrefix: string;
}

export class EcrStack extends cdk.Stack {
  readonly nodeRepository: ecr.IRepository;
  readonly appRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { projectPrefix } = props;

    const nodeRepository = ecr.Repository.fromRepositoryName(
      this,
      "nodeRepository",
      "node"
    );

    const appRepository = new ecr.Repository(this, "AppRepository", {
      repositoryName: `${projectPrefix}-app`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    this.nodeRepository = nodeRepository;
    this.appRepository = appRepository;
  }
}
