data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  cluster_name = "${var.project}-eks"
  azs          = slice(data.aws_availability_zones.available.names, 0, 2)

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Network: VPC with 2 public + 2 private subnets across 2 AZs, one NAT gateway
# ---------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.21"

  name = "${var.project}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 101)] # 10.30.101.0/24, 10.30.102.0/24
  private_subnets = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]   # 10.30.1.0/24,   10.30.2.0/24

  enable_nat_gateway   = true
  single_nat_gateway   = true # one NAT keeps cost down; use one per AZ for real HA
  enable_dns_hostnames = true

  # Tags that let Kubernetes place internet-facing / internal load balancers in the right subnets.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# ---------------------------------------------------------------------------
# EKS cluster + managed node group
# ---------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.37"

  cluster_name    = local.cluster_name
  cluster_version = var.cluster_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets # worker nodes live in private subnets

  cluster_endpoint_public_access           = true
  enable_cluster_creator_admin_permissions = true

  cluster_addons = {
    coredns    = {}
    kube-proxy = {}
    vpc-cni = {
      before_compute = true
      # Turns on enforcement of Kubernetes NetworkPolicy (used to lock down PostgreSQL).
      configuration_values = jsonencode({ enableNetworkPolicy = "true" })
    }
    eks-pod-identity-agent = {}
    # Required for PersistentVolumes (PostgreSQL data) on EBS.
    aws-ebs-csi-driver = {
      service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
    }
  }

  eks_managed_node_groups = {
    main = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = var.node_instance_types
      min_size       = var.node_min_size
      desired_size   = var.node_desired_size
      max_size       = var.node_max_size
      disk_size      = 30
      labels = {
        workload = "general"
      }
    }
  }
}

# IAM role the EBS CSI driver assumes (IRSA) so it can create/attach EBS volumes.
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name             = "${local.cluster_name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}
