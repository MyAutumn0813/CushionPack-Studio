suppressPackageStartupMessages({
  library(plumber)
})

host <- Sys.getenv("PLUMBER_HOST", unset = "127.0.0.1")
port_value <- Sys.getenv("PLUMBER_PORT", unset = "8791")
port <- suppressWarnings(as.integer(port_value))
if (is.na(port) || port < 1) {
  stop("PLUMBER_PORT must be a valid integer port.", call. = FALSE)
}

api_path <- file.path(getwd(), "r-api", "library-api.R")
script_args <- commandArgs(trailingOnly = FALSE)
file_arg <- script_args[grepl("^--file=", script_args)]
if (!file.exists(api_path)) {
  if (length(file_arg) > 0) {
    script_dir <- dirname(normalizePath(sub("^--file=", "", file_arg[[1]]), winslash = "/", mustWork = TRUE))
    api_path <- file.path(script_dir, "library-api.R")
  }
}

runner_path <- if (length(file_arg) > 0) {
  normalizePath(sub("^--file=", "", file_arg[[1]]), winslash = "/", mustWork = TRUE)
} else {
  normalizePath(file.path(dirname(api_path), "run-library-api.R"), winslash = "/", mustWork = TRUE)
}

signature_paths <- unique(normalizePath(c(api_path, runner_path), winslash = "/", mustWork = TRUE))
signature_hashes <- tools::md5sum(signature_paths)
signature_value <- paste(sprintf("%s=%s", names(signature_hashes), unname(signature_hashes)), collapse = "|")
Sys.setenv(PLUMBER_SOURCE_SIGNATURE = signature_value)

pr <- plumber::plumb(api_path)
pr$run(host = host, port = port)
