variable "iam_boundary_arn" {
  default = "arn:aws:iam::872515267246:policy/CourtVisionBoundary"
}

variable "gemini_api_key" {
  description = "Gemini API key for NBA poller caption generation."
  type        = string
  sensitive   = true
}

variable "minutesmap_revalidate_url" {
  description = "Optional MinutesMap revalidation endpoint called after final page artifacts are written."
  type        = string
  default     = "https://minutes-map-teams.vercel.app/api/revalidate"
}

variable "minutesmap_revalidate_secret_arn" {
  description = "ARN of the AWS Secrets Manager secret containing the MinutesMap revalidation secret."
  type        = string
  default     = "arn:aws:secretsmanager:us-east-1:872515267246:secret:minutesmap/revalidate-secret-XRYnes"
}
