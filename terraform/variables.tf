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

variable "nba_poller_mode" {
  description = "Which NBA ingest pipeline is active: \"lambda\" (NBAGamePoller, reading the Pi relay's S3 mirror) or \"pi\" (pi/run_poller.py on the Raspberry Pi). See pi/README.md."
  type        = string
  default     = "pi"

  validation {
    condition     = contains(["lambda", "pi"], var.nba_poller_mode)
    error_message = "nba_poller_mode must be \"lambda\" or \"pi\"."
  }
}
