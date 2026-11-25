terraform {
  required_version = ">= 1.6"
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {}

locals {
  registry = "${var.region}-docker.pkg.dev/${var.project_id}/engineering-notebook"
  secrets = toset([
    "better-auth-secret",
    "internal-service-secret",
    "google-client-secret",
    "github-client-secret",
    "discord-client-secret",
    "linkedin-client-secret",
  ])
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.apis]
}

resource "google_firestore_index" "verification_identifier_created_at" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "verification"

  fields {
    field_path = "identifier"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }

  fields {
    field_path = "__name__"
    order      = "DESCENDING"
  }
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "engineering-notebook"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_storage_bucket" "notebook_assets" {
  name                        = "${var.project_id}-notebook-assets"
  location                    = var.region
  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.apis]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "cloud_run_secret_accessor" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_pubsub_topic" "compile_jobs" {
  name       = "notebook-jobs-compile"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "judge_jobs" {
  name       = "notebook-jobs-judge"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_subscription" "compile_jobs" {
  name  = "notebook-jobs-compile-worker"
  topic = google_pubsub_topic.compile_jobs.name
  ack_deadline_seconds = 600
}

resource "google_pubsub_subscription" "judge_jobs" {
  name  = "notebook-jobs-judge-worker"
  topic = google_pubsub_topic.judge_jobs.name
  ack_deadline_seconds = 600
}

resource "google_pubsub_subscription_iam_member" "compile_subscriber" {
  subscription = google_pubsub_subscription.compile_jobs.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "judge_subscriber" {
  subscription = google_pubsub_subscription.judge_jobs.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_pubsub_topic_iam_member" "core_compile_publisher" {
  topic  = google_pubsub_topic.compile_jobs.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_pubsub_topic_iam_member" "core_judge_publisher" {
  topic  = google_pubsub_topic.judge_jobs.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

resource "google_cloud_run_v2_service" "core" {
  name                = "core"
  location            = var.region
  deletion_protection = false
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/core:${var.image_tag}"
      ports { container_port = 8080 }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.notebook_assets.name
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.cloud_run_secret_accessor]
}

resource "google_cloud_run_v2_service" "collab" {
  name                = "collab"
  location            = var.region
  deletion_protection = false
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/collab:${var.image_tag}"
      ports { container_port = 1234 }
      env {
        name  = "CORE_API_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.cloud_run_secret_accessor]
}

resource "google_cloud_run_v2_service" "compile" {
  name                = "compile"
  location            = var.region
  deletion_protection = false
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    timeout = "600s"
    containers {
      image = "${local.registry}/compile:${var.image_tag}"
      ports { container_port = 8090 }
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }
      env {
        name  = "CORE_API_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_SUBSCRIPTION_COMPILE"
        value = google_pubsub_subscription.compile_jobs.name
      }
      env {
        name  = "COMPILE_MODE"
        value = "server"
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.cloud_run_secret_accessor, google_pubsub_subscription_iam_member.compile_subscriber]
}

resource "google_cloud_run_v2_service" "judge" {
  name                = "judge"
  location            = var.region
  deletion_protection = false
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    timeout = "600s"
    containers {
      image = "${local.registry}/judge:${var.image_tag}"
      ports { container_port = 8091 }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
      env {
        name  = "CORE_API_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_SUBSCRIPTION_JUDGE"
        value = google_pubsub_subscription.judge_jobs.name
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.cloud_run_secret_accessor, google_pubsub_subscription_iam_member.judge_subscriber]
}

resource "google_cloud_run_v2_service" "website" {
  name                = "website"
  location            = var.region
  deletion_protection = false
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = "${local.registry}/website:${var.image_tag}"
      ports { container_port = 3000 }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.app_url
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "BETTER_AUTH_URL"
        value = var.app_url
      }
      env {
        name  = "NEXT_PUBLIC_CORE_API_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "CORE_API_INTERNAL_URL"
        value = google_cloud_run_v2_service.core.uri
      }
      env {
        name  = "NEXT_PUBLIC_COLLAB_WS_URL"
        value = replace(google_cloud_run_v2_service.collab.uri, "https://", "wss://")
      }
      env {
        name = "BETTER_AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["better-auth-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "INTERNAL_SERVICE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["internal-service-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["google-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GITHUB_CLIENT_ID"
        value = var.github_client_id
      }
      env {
        name = "GITHUB_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["github-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "DISCORD_CLIENT_ID"
        value = var.discord_client_id
      }
      env {
        name = "DISCORD_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["discord-client-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "LINKEDIN_CLIENT_ID"
        value = var.linkedin_client_id
      }
      env {
        name = "LINKEDIN_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["linkedin-client-secret"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.cloud_run_secret_accessor]
}

output "website_url" {
  value = google_cloud_run_v2_service.website.uri
}

output "core_url" {
  value = google_cloud_run_v2_service.core.uri
}

output "collab_url" {
  value = google_cloud_run_v2_service.collab.uri
}

# Allow public unauthenticated access to user-facing web services
resource "google_cloud_run_v2_service_iam_member" "website_public" {
  name     = google_cloud_run_v2_service.website.name
  location = google_cloud_run_v2_service.website.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "core_public" {
  name     = google_cloud_run_v2_service.core.name
  location = google_cloud_run_v2_service.core.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "collab_public" {
  name     = google_cloud_run_v2_service.collab.name
  location = google_cloud_run_v2_service.collab.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_domain_mapping" "website_domain" {
  count    = var.app_url != "" && !endswith(var.app_url, ".run.app") ? 1 : 0
  location = var.region
  name     = replace(replace(var.app_url, "https://", ""), "http://", "")

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.website.name
  }
}
