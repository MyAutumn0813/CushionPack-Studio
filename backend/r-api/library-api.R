suppressPackageStartupMessages({
  library(plumber)
  library(jsonlite)
  library(tidymodels)
  library(xgboost)
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(ggplot2)
  library(rio)
  library(tibble)
})

parse_request_body <- function(req) {
  body <- req$postBody
  if (is.null(body) || !nzchar(trimws(body))) {
    return(list())
  }

  jsonlite::fromJSON(body, simplifyVector = FALSE)
}

require_payload_string <- function(payload, field_name) {
  value <- payload[[field_name]]
  if (is.null(value) || !nzchar(trimws(as.character(value)))) {
    stop(sprintf("%s is required.", field_name), call. = FALSE)
  }

  trimws(as.character(value))
}

normalize_existing_path <- function(raw_path, field_name) {
  normalized <- normalizePath(require_payload_string(raw_path, field_name), winslash = "/", mustWork = TRUE)
  if (!file.exists(normalized)) {
    stop(sprintf("%s was not found.", field_name), call. = FALSE)
  }
  normalized
}

normalize_optional_output_path <- function(payload, field_name) {
  value <- payload[[field_name]]
  if (is.null(value) || !nzchar(trimws(as.character(value)))) {
    return("")
  }

  normalizePath(trimws(as.character(value)), winslash = "/", mustWork = FALSE)
}

rows_from_df <- function(df) {
  if (!is.data.frame(df) || nrow(df) < 1) {
    return(list())
  }

  lapply(seq_len(nrow(df)), function(index) {
    as.list(df[index, , drop = FALSE])
  })
}

export_workbook_if_requested <- function(df, output_path) {
  workbook_generated <- FALSE
  workbook_message <- ""

  if (!nzchar(output_path)) {
    return(list(workbookGenerated = FALSE, workbookMessage = workbook_message))
  }

  dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)

  tryCatch(
    {
      rio::export(df, output_path)
      workbook_generated <- file.exists(output_path)
      if (!workbook_generated) {
        workbook_message <- sprintf("%s was not written to %s", basename(output_path), output_path)
      }
    },
    error = function(err) {
      workbook_message <<- conditionMessage(err)
    }
  )

  list(workbookGenerated = workbook_generated, workbookMessage = workbook_message)
}

compute_validation_accuracy <- function(model_path) {
  ml_results <- readRDS(model_path)

  validation_accuracy <- collect_metrics(ml_results, summarize = TRUE) %>%
    dplyr::filter(.metric == "rsq") %>%
    dplyr::group_by(wflow_id) %>%
    dplyr::slice_max(order_by = mean, n = 1, with_ties = FALSE) %>%
    dplyr::ungroup() %>%
    dplyr::select(wflow_id, .config, mean, std_err, n)

  fold_metrics <- collect_metrics(ml_results, summarize = FALSE) %>%
    dplyr::filter(.metric %in% c("rsq", "rmse")) %>%
    dplyr::select(wflow_id, id, .config, .metric, .estimate)

  fold_best <- fold_metrics %>%
    dplyr::inner_join(
      validation_accuracy %>% dplyr::select(wflow_id, .config),
      by = c("wflow_id", ".config")
    ) %>%
    tidyr::pivot_wider(names_from = .metric, values_from = .estimate) %>%
    dplyr::arrange(wflow_id, id)

  fold_best %>%
    dplyr::group_by(wflow_id) %>%
    dplyr::summarise(
      rsq_mean = mean(rsq, na.rm = TRUE),
      rsq_sd = stats::sd(rsq, na.rm = TRUE),
      rmse_mean = mean(rmse, na.rm = TRUE),
      rmse_sd = stats::sd(rmse, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    dplyr::arrange(desc(rsq_mean)) %>%
    dplyr::mutate(
      wflow_id = as.character(wflow_id),
      rsq_mean = as.numeric(rsq_mean),
      rsq_sd = as.numeric(rsq_sd),
      rmse_mean = as.numeric(rmse_mean),
      rmse_sd = as.numeric(rmse_sd)
    ) %>%
    as.data.frame(stringsAsFactors = FALSE)
}

compute_best_hyperparameters <- function(model_path) {
  ml_results <- readRDS(model_path)

  ml_results %>%
    dplyr::distinct(wflow_id) %>%
    dplyr::pull(wflow_id) %>%
    purrr::map_dfr(function(workflow_id) {
      extract_workflow_set_result(ml_results, workflow_id) %>%
        select_best(metric = "rsq") %>%
        dplyr::mutate(wflow_id = workflow_id)
    }) %>%
    tidyr::pivot_longer(
      cols = -c(wflow_id, .config),
      names_to = "Hyperparameter",
      values_to = "Value",
      values_transform = list(Value = as.character)
    ) %>%
    dplyr::filter(!is.na(Value)) %>%
    dplyr::transmute(
      Model = as.character(wflow_id),
      Hyperparameter = as.character(Hyperparameter),
      Value = as.character(Value)
    ) %>%
    dplyr::arrange(Model, Hyperparameter) %>%
    as.data.frame(stringsAsFactors = FALSE)
}

build_temp_plot_path <- function(algorithm, model_path) {
  safe_algorithm <- gsub("[^A-Za-z0-9]+", "_", algorithm)
  safe_model <- gsub("[^A-Za-z0-9]+", "_", basename(model_path))
  plot_dir <- file.path(tempdir(), "bufferpack-plumber")
  dir.create(plot_dir, recursive = TRUE, showWarnings = FALSE)
  timestamp <- gsub("[^0-9]", "", format(Sys.time(), "%Y%m%d%H%M%OS3"))
  file.path(plot_dir, sprintf("%s-%s-%s.png", safe_model, safe_algorithm, timestamp))
}

compute_accuracy_performance <- function(model_path, data_train_path, data_test_path, algorithm) {
  ml_results <- readRDS(model_path)
  data_train <- rio::import(data_train_path)
  data_test <- rio::import(data_test_path)
  outcome <- "Peak_acceleration"

  if (!outcome %in% names(data_train)) {
    stop("data_train does not contain outcome column: Peak_acceleration", call. = FALSE)
  }
  if (!outcome %in% names(data_test)) {
    stop("data_test does not contain outcome column: Peak_acceleration", call. = FALSE)
  }

  workflow_result <- ml_results %>%
    extract_workflow_set_result(algorithm)

  best_params <- select_best(workflow_result, metric = "rsq")

  final_model <- ml_results %>%
    extract_workflow(algorithm) %>%
    finalize_workflow(best_params) %>%
    fit(data = data_train)

  train_result <- bind_cols(
    tibble(!!outcome := data_train[[outcome]]),
    predict(final_model, data_train)
  ) %>%
    mutate(set = "Training")

  train_fit <- stats::lm(stats::reformulate(".pred", response = outcome), data = train_result)
  r2_train <- summary(train_fit)$r.squared
  rmse_train <- yardstick::rmse_vec(truth = train_result[[outcome]], estimate = train_result$.pred)

  test_result <- bind_cols(
    tibble(!!outcome := data_test[[outcome]]),
    predict(final_model, data_test)
  ) %>%
    mutate(set = "Testing")

  test_fit <- stats::lm(stats::reformulate(".pred", response = outcome), data = test_result)
  r2_test <- summary(test_fit)$r.squared
  rmse_test <- yardstick::rmse_vec(truth = test_result[[outcome]], estimate = test_result$.pred)

  all_result <- bind_rows(train_result, test_result)
  point_rows <- all_result %>%
    dplyr::transmute(
      set = as.character(set),
      actual = as.numeric(.data[[outcome]]),
      predicted = as.numeric(.pred)
    ) %>%
    as.data.frame(stringsAsFactors = FALSE)
  plot_values <- c(all_result[[outcome]], all_result$.pred)
  limit_min <- min(plot_values, na.rm = TRUE)
  limit_max <- max(plot_values, na.rm = TRUE)
  span <- limit_max - limit_min
  if (!is.finite(span) || span <= 0) {
    span <- 1
  }
  padding <- span * 0.05
  x_min <- limit_min - padding
  x_max <- limit_max + padding

  plot_path <- build_temp_plot_path(algorithm, model_path)

  plot <- ggplot(all_result, aes(x = .data[[outcome]], y = .pred, color = set)) +
    geom_abline(slope = 1, intercept = 0, linetype = "dashed", color = "#7c7575") +
    geom_point(aes(shape = set), size = 1.8, alpha = 0.72) +
    scale_shape_manual(values = c("Training" = 16, "Testing" = 17)) +
    geom_smooth(method = lm, se = TRUE, linewidth = 0.65) +
    scale_color_manual(values = c("Training" = "#25B677", "Testing" = "#3794E9")) +
    theme_bw(base_size = 13) +
    theme(
      legend.position = "none",
      plot.title = element_text(size = 16, face = "bold"),
      axis.title = element_text(size = 18, face = "bold"),
      axis.text = element_text(face = "bold", size = 11)
    ) +
    labs(
      x = "Simulated peak acceleration (g)",
      y = "Predicted peak acceleration (g)"
    ) +
    scale_x_continuous(limits = c(x_min, x_max)) +
    scale_y_continuous(limits = c(x_min, x_max))

  ggplot2::ggsave(filename = plot_path, plot = plot, width = 7.2, height = 5.2, dpi = 180, bg = "white")

  list(
    metrics = list(
      r2Train = as.numeric(r2_train),
      rmseTrain = as.numeric(rmse_train),
      r2Test = as.numeric(r2_test),
      rmseTest = as.numeric(rmse_test)
    ),
    points = rows_from_df(point_rows),
    plotPath = plot_path,
    plotGenerated = file.exists(plot_path)
  )
}

compute_explore_reverse_design <- function(
  model_path,
  fixed_inputs,
  parameter_ranges,
  threshold = 60,
  density_step = 1,
  thickness_step = 2
) {
  final_model_reg <- readRDS(model_path)

  fixed_tbl <- tibble::tibble(
    TV_length = as.numeric(fixed_inputs$tvLength),
    TV_width = as.numeric(fixed_inputs$tvWidth),
    TV_height = as.numeric(fixed_inputs$tvHeight),
    Drop_height = as.numeric(fixed_inputs$dropHeight)
  )

  if (any(!is.finite(unlist(fixed_tbl[1, ])))) {
    stop("fixedInputs are invalid.", call. = FALSE)
  }

  constraint_tbl <- purrr::map_dfr(parameter_ranges, function(item) {
    tibble::tibble(
      Liner_category = as.character(if (is.null(item$category)) "" else item$category),
      density_min = as.numeric(item$densityMin),
      density_max = as.numeric(item$densityMax),
      thickness_min = as.numeric(item$thicknessMin),
      thickness_max = as.numeric(item$thicknessMax)
    )
  }) %>%
    dplyr::filter(nzchar(trimws(Liner_category)))

  if (nrow(constraint_tbl) < 1) {
    stop("parameterRanges are required.", call. = FALSE)
  }

  if (any(!is.finite(unlist(constraint_tbl[, c("density_min", "density_max", "thickness_min", "thickness_max")])))) {
    stop("parameterRanges contain invalid numeric values.", call. = FALSE)
  }

  if (any(constraint_tbl$density_min > constraint_tbl$density_max | constraint_tbl$thickness_min > constraint_tbl$thickness_max)) {
    stop("parameterRanges contain invalid min/max values.", call. = FALSE)
  }

  if (!is.finite(threshold) || !is.finite(density_step) || !is.finite(thickness_step) || density_step <= 0 || thickness_step <= 0) {
    stop("Search parameters are invalid.", call. = FALSE)
  }

  grid_data <- purrr::map_dfr(seq_len(nrow(constraint_tbl)), function(i) {
    rule <- constraint_tbl[i, ]
    density_values <- seq(rule$density_min[[1]], rule$density_max[[1]], by = density_step)
    thickness_values <- seq(rule$thickness_min[[1]], rule$thickness_max[[1]], by = thickness_step)

    tidyr::expand_grid(
      Liner_category = rule$Liner_category[[1]],
      Liner_density = density_values,
      Liner_thickness = thickness_values
    )
  }) %>%
    dplyr::mutate(
      TV_length = fixed_tbl$TV_length[[1]],
      TV_width = fixed_tbl$TV_width[[1]],
      TV_height = fixed_tbl$TV_height[[1]],
      Drop_height = fixed_tbl$Drop_height[[1]],
      ID = 1,
      class = "GRID"
    ) %>%
    dplyr::relocate(ID, class)

  if (nrow(grid_data) < 1) {
    stop("No search points were generated from parameterRanges.", call. = FALSE)
  }

  grid_data <- grid_data %>%
    dplyr::mutate(
      Liner_category = factor(Liner_category, levels = unique(constraint_tbl$Liner_category))
    )

  predicted_values <- predict(final_model_reg, new_data = grid_data)
  pred_column <- predicted_values$.pred
  if (is.null(pred_column)) {
    stop("Model prediction output is invalid.", call. = FALSE)
  }

  grid_results <- grid_data %>%
    dplyr::mutate(
      Pred = as.numeric(pred_column),
      Material = as.numeric(Liner_density) * as.numeric(Liner_thickness),
      Feasible = !is.na(Pred) & Pred <= threshold
    )

  feasible_grid_solutions <- grid_results %>%
    dplyr::filter(Feasible)

  best_overall <- feasible_grid_solutions %>%
    dplyr::arrange(Pred, Liner_category, Liner_density, Liner_thickness) %>%
    dplyr::slice_head(n = 1) %>%
    dplyr::transmute(
      category = as.character(Liner_category),
      density = as.numeric(Liner_density),
      thickness = as.numeric(Liner_thickness),
      predictedAcceleration = as.numeric(Pred),
      materialUsage = as.numeric(Material),
      feasibleCount = as.integer(nrow(feasible_grid_solutions))
    )

  best_by_category <- purrr::map_dfr(unique(constraint_tbl$Liner_category), function(category_name) {
    feasible_rows <- feasible_grid_solutions %>%
      dplyr::filter(as.character(Liner_category) == category_name) %>%
      dplyr::arrange(Pred, Liner_density, Liner_thickness)

    if (nrow(feasible_rows) < 1) {
      return(tibble::tibble(
        category = category_name,
        density = NA_real_,
        thickness = NA_real_,
        predictedAcceleration = NA_real_,
        materialUsage = NA_real_,
        feasibleCount = 0L
      ))
    }

    feasible_rows %>%
      dplyr::slice_head(n = 1) %>%
      dplyr::transmute(
        category = as.character(Liner_category),
        density = as.numeric(Liner_density),
        thickness = as.numeric(Liner_thickness),
        predictedAcceleration = as.numeric(Pred),
        materialUsage = as.numeric(Material),
        feasibleCount = as.integer(nrow(feasible_rows))
      )
  })

  grid_export <- grid_results %>%
    dplyr::transmute(
      category = as.character(Liner_category),
      density = as.numeric(Liner_density),
      thickness = as.numeric(Liner_thickness),
      predictedAcceleration = as.numeric(Pred),
      feasible = as.logical(Feasible),
      materialUsage = as.numeric(Material)
    )

  list(
    gridRows = rows_from_df(grid_export),
    bestByCategory = rows_from_df(best_by_category),
    bestOverall = rows_from_df(best_overall),
    summary = list(
      totalPoints = nrow(grid_export),
      feasiblePoints = nrow(feasible_grid_solutions),
      threshold = as.numeric(threshold),
      densityStep = as.numeric(density_step),
      thicknessStep = as.numeric(thickness_step)
    )
  )
}

compute_new_task_prediction <- function(model_path, input_path) {
  undata <- rio::import(input_path)
  if (!is.data.frame(undata) || nrow(undata) < 1) {
    stop("Input workbook is empty.", call. = FALSE)
  }


  new_names <- c(
    "ID",
    "Drop_height",
    "TV_length",
    "TV_width",
    "TV_height",
    "Liner_category",
    "Liner_density",
    "Liner_thickness",
    "Product_fragility"
  )

  if (ncol(undata) < length(new_names)) {
    stop("Input workbook does not contain required columns.", call. = FALSE)
  }

  undata <- undata[, seq_along(new_names), drop = FALSE]
  names(undata) <- new_names
  undata <- as_tibble(undata)

  numeric_columns <- c(
    "Drop_height",
    "TV_length",
    "TV_width",
    "TV_height",
    "Liner_density",
    "Liner_thickness",
    "Product_fragility"
  )

  undata <- undata %>%
    mutate(across(all_of(numeric_columns), ~ suppressWarnings(as.numeric(.x))))

  if (any(is.na(undata$ID) | !nzchar(trimws(as.character(undata$ID))))) {
    stop("ID column is required.", call. = FALSE)
  }
  if (any(is.na(undata$Liner_category) | !nzchar(trimws(as.character(undata$Liner_category))))) {
    stop("Liner_category column is required.", call. = FALSE)
  }
  if (any(!stats::complete.cases(undata[, numeric_columns, drop = FALSE]))) {
    stop("Numeric columns contain invalid values.", call. = FALSE)
  }

  un_data <- undata %>%
    mutate(
      ID_original = ID,
      ID = row_number(),
      class = if_else(Product_fragility > 60, "Unqualified", "Qualified")
    ) %>%
    relocate(class:Product_fragility, .after = ID)

  final_model_reg <- readRDS(model_path)

  predicted_result_reg <- final_model_reg %>%
    predict(un_data) %>%
    bind_cols(un_data) %>%
    relocate(.pred, .after = Product_fragility) %>%
    mutate(Error = .pred - Product_fragility) %>%
    mutate(class = if_else(Product_fragility > .pred, "Unqualified", "Qualified")) %>%
    relocate(Error, .after = .pred) %>%
    mutate(ID = ID_original) %>%
    select(-ID_original) %>%
    as.data.frame(stringsAsFactors = FALSE)

  summary_rows <- predicted_result_reg %>%
    transmute(
      ID = as.character(ID),
      predictedAcceleration = as.numeric(.pred),
      predictedResult = as.character(class)
    ) %>%
    as.data.frame(stringsAsFactors = FALSE)

  list(
    rows = predicted_result_reg,
    summaryRows = summary_rows
  )
}

compute_new_task_shap_waterfall <- function(model_path, input_path, target_id = "", max_display = 15) {
  undata <- rio::import(input_path)
  if (!is.data.frame(undata) || nrow(undata) < 1) {
    stop("Input workbook is empty.", call. = FALSE)
  }

  new_names <- c(
    "ID",
    "Drop_height",
    "TV_length",
    "TV_width",
    "TV_height",
    "Liner_category",
    "Liner_density",
    "Liner_thickness",
    "Product_fragility"
  )

  if (ncol(undata) < length(new_names)) {
    stop("Input workbook does not contain required columns.", call. = FALSE)
  }

  undata <- undata[, seq_along(new_names), drop = FALSE]
  names(undata) <- new_names
  undata <- as_tibble(undata)

  numeric_columns <- c(
    "Drop_height",
    "TV_length",
    "TV_width",
    "TV_height",
    "Liner_density",
    "Liner_thickness",
    "Product_fragility"
  )

  undata <- undata %>%
    mutate(across(all_of(numeric_columns), ~ suppressWarnings(as.numeric(.x))))

  if (any(is.na(undata$ID) | !nzchar(trimws(as.character(undata$ID))))) {
    stop("ID column is required.", call. = FALSE)
  }
  if (any(is.na(undata$Liner_category) | !nzchar(trimws(as.character(undata$Liner_category))))) {
    stop("Liner_category column is required.", call. = FALSE)
  }
  if (any(!stats::complete.cases(undata[, numeric_columns, drop = FALSE]))) {
    stop("Numeric columns contain invalid values.", call. = FALSE)
  }

  un_data <- undata %>%
    mutate(
      ID_original = as.character(ID),
      ID = row_number(),
      class = if_else(Product_fragility > 60, "Unqualified", "Qualified")
    ) %>%
    relocate(class:Product_fragility, .after = ID)

  final_model_reg <- readRDS(model_path)

  predicted_result_reg <- final_model_reg %>%
    predict(un_data) %>%
    bind_cols(un_data) %>%
    relocate(.pred, .after = Product_fragility) %>%
    mutate(Error = .pred - Product_fragility) %>%
    mutate(class = if_else(Product_fragility > .pred, "Unqualified", "Qualified")) %>%
    relocate(Error, .after = .pred) %>%
    mutate(ID = ID_original) %>%
    select(-ID_original)

  target_id_normalized <- trimws(as.character(target_id))
  target_row <- predicted_result_reg
  if (nzchar(target_id_normalized)) {
    target_row <- predicted_result_reg %>%
      dplyr::filter(as.character(ID) == target_id_normalized)
    if (nrow(target_row) < 1) {
      stop(sprintf("Target ID '%s' was not found in task input.", target_id_normalized), call. = FALSE)
    }
  }
  target_row <- target_row[1, , drop = FALSE]

  xgb_booster <- extract_fit_parsnip(final_model_reg)$fit
  mold <- extract_mold(final_model_reg)
  X_new <- bake(
    mold$blueprint$recipe,
    new_data = target_row,
    all_predictors()
  )

  X_matrix <- as.matrix(X_new)
  contribution_matrix <- predict(xgb_booster, X_matrix, predcontrib = TRUE)
  if (is.null(dim(contribution_matrix))) {
    contribution_matrix <- matrix(contribution_matrix, nrow = 1)
  }

  contribution_names <- colnames(contribution_matrix)
  if (is.null(contribution_names) || length(contribution_names) != ncol(contribution_matrix)) {
    contribution_names <- c(colnames(X_matrix), "BIAS")
  }

  bias_index <- which(toupper(contribution_names) %in% c("BIAS", "BASE_VALUE", "BASEVALUE"))
  if (length(bias_index) < 1) {
    bias_index <- length(contribution_names)
  }
  bias_index <- bias_index[[1]]

  baseline <- as.numeric(contribution_matrix[1, bias_index])
  feature_names <- colnames(X_matrix)
  if (is.null(feature_names) || length(feature_names) < 1) {
    stop("Unable to read feature names from model input.", call. = FALSE)
  }

  feature_contributions <- as.numeric(contribution_matrix[1, seq_along(feature_names)])
  feature_values <- as.numeric(X_matrix[1, seq_along(feature_names)])
  feature_display_name_map <- c(
    "TV_length" = "Product_length",
    "TV_width" = "Product_width",
    "TV_height" = "Product_height"
  )

  shap_df <- tibble::tibble(
    feature = feature_names,
    featureValue = feature_values,
    contribution = feature_contributions
  ) %>%
    dplyr::mutate(
      feature = dplyr::recode(feature, !!!feature_display_name_map)
    ) %>%
    dplyr::arrange(desc(abs(contribution)))

  if (nrow(shap_df) > max_display) {
    keep_count <- max_display - 1
    other_contribution <- sum(shap_df$contribution[(keep_count + 1):nrow(shap_df)], na.rm = TRUE)
    shap_df <- dplyr::bind_rows(
      shap_df %>% dplyr::slice_head(n = keep_count),
      tibble::tibble(
        feature = "Other features",
        featureValue = NA_real_,
        contribution = other_contribution
      )
    )
  }

  running_value <- baseline
  step_rows <- purrr::map_dfr(seq_len(nrow(shap_df)), function(index) {
    row <- shap_df[index, , drop = FALSE]
    contribution <- as.numeric(row$contribution[[1]])
    start_value <- running_value
    end_value <- start_value + contribution
    running_value <<- end_value

    tibble::tibble(
      feature = as.character(row$feature[[1]]),
      featureValue = if (is.na(row$featureValue[[1]])) "" else as.character(signif(row$featureValue[[1]], 6)),
      contribution = contribution,
      start = start_value,
      end = end_value,
      direction = ifelse(contribution >= 0, "positive", "negative")
    )
  })

  prediction <- baseline + sum(feature_contributions, na.rm = TRUE)

  list(
    targetId = as.character(target_row$ID[[1]]),
    baseline = as.numeric(baseline),
    prediction = as.numeric(prediction),
    steps = step_rows
  )
}

with_error_response <- function(res, expr) {
  tryCatch(
    expr,
    error = function(err) {
      res$status <- 400
      list(message = conditionMessage(err))
    }
  )
}

#* BufferPack Library R API
#* @apiTitle BufferPack Library R API

#* Health check
#* @get /health
#* @serializer unboxedJSON
function() {
  list(
    status = "ok",
    signature = Sys.getenv("PLUMBER_SOURCE_SIGNATURE", unset = "")
  )
}

#* Compute validation accuracy rows
#* @post /validation-accuracy
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    output_path <- normalize_optional_output_path(payload, "outputPath")
    rows_df <- compute_validation_accuracy(model_path)
    export_result <- export_workbook_if_requested(rows_df, output_path)

    list(
      rows = rows_from_df(rows_df),
      workbookGenerated = export_result$workbookGenerated,
      workbookMessage = export_result$workbookMessage
    )
  })
}

#* Compute best hyper-parameter rows
#* @post /best-hyperparameters
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    output_path <- normalize_optional_output_path(payload, "outputPath")
    rows_df <- compute_best_hyperparameters(model_path)
    export_result <- export_workbook_if_requested(rows_df, output_path)

    list(
      rows = rows_from_df(rows_df),
      workbookGenerated = export_result$workbookGenerated,
      workbookMessage = export_result$workbookMessage
    )
  })
}

#* Compute accuracy performance metrics and plot
#* @post /accuracy-performance
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    data_train_path <- normalizePath(require_payload_string(payload, "dataTrainPath"), winslash = "/", mustWork = TRUE)
    data_test_path <- normalizePath(require_payload_string(payload, "dataTestPath"), winslash = "/", mustWork = TRUE)
    algorithm <- require_payload_string(payload, "algorithm")
    result <- compute_accuracy_performance(model_path, data_train_path, data_test_path, algorithm)

    list(
      metrics = result$metrics,
      points = result$points,
      plotPath = result$plotPath,
      plotGenerated = result$plotGenerated
    )
  })
}

#* Compute Explore reverse-design results
#* @post /explore-reverse-design
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    fixed_inputs <- payload$fixedInputs
    parameter_ranges <- payload$parameterRanges
    threshold <- as.numeric(if (is.null(payload$threshold)) 60 else payload$threshold)
    density_step <- as.numeric(if (is.null(payload$densityStep)) 1 else payload$densityStep)
    thickness_step <- as.numeric(if (is.null(payload$thicknessStep)) 2 else payload$thicknessStep)

    compute_explore_reverse_design(
      model_path = model_path,
      fixed_inputs = fixed_inputs,
      parameter_ranges = parameter_ranges,
      threshold = threshold,
      density_step = density_step,
      thickness_step = thickness_step
    )
  })
}

#* Compute new-task prediction results
#* @post /new-task-prediction
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    input_path <- normalizePath(require_payload_string(payload, "inputPath"), winslash = "/", mustWork = TRUE)
    output_path <- normalize_optional_output_path(payload, "outputPath")
    result <- compute_new_task_prediction(model_path, input_path)
    export_result <- export_workbook_if_requested(result$rows, output_path)

    list(
      rows = rows_from_df(result$rows),
      summaryRows = rows_from_df(result$summaryRows),
      workbookGenerated = export_result$workbookGenerated,
      workbookMessage = export_result$workbookMessage
    )
  })
}

#* Compute SHAP waterfall plot for one new-task row
#* @post /new-task-shap-waterfall
#* @serializer unboxedJSON
function(req, res) {
  with_error_response(res, {
    payload <- parse_request_body(req)
    model_path <- normalizePath(require_payload_string(payload, "modelPath"), winslash = "/", mustWork = TRUE)
    input_path <- normalizePath(require_payload_string(payload, "inputPath"), winslash = "/", mustWork = TRUE)
    target_id <- if (!is.null(payload$targetId)) trimws(as.character(payload$targetId)) else ""
    result <- compute_new_task_shap_waterfall(model_path, input_path, target_id)

    list(
      targetId = result$targetId,
      baseline = result$baseline,
      prediction = result$prediction,
      steps = rows_from_df(result$steps)
    )
  })
}
