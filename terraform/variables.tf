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
  default     = "https://teams.minutesmap.com/api/revalidate"
}

variable "minutesmap_revalidate_secret" {
  description = "MinutesMap revalidation secret passed to the NBA poller Lambda."
  type        = string
  sensitive   = true
  default     = ""
}
