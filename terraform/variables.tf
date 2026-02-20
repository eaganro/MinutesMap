variable "iam_boundary_arn" {
  default = "arn:aws:iam::872515267246:policy/CourtVisionBoundary"
}

variable "gemini_api_key" {
  description = "Gemini API key for NBA poller caption generation."
  type        = string
  sensitive   = true
}
