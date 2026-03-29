# =============================================================
# CushionPack Studio 鈥?Shiny 鍗曢〉搴旂敤锛堜腑鏂囨敞閲婄増 v2.1锛?
# 鍙樻洿浜偣锛坴2.1锛夛細
#  1) 鍒嗙被/鍥炲綊鏂板鎸囨爣琛紙accuracy/sens/spec/F1锛汻MSE/MAE/R^2锛夈€?
#  2) 淇 ROC 璁＄畻鐨勨€滈槼鎬х被鈥濅笌鍥犲瓙姘村钩锛岄伩鍏嶅洜姘村钩椤哄簭瀵艰嚧鐨勫亸宸€?
#  3) 棰勬祴缁撴灉鏀寔涓€閿笅杞斤紙CSV锛夈€?
#  4) UI 寰皟锛氭洿绋崇殑鑷€傚簲缃戞牸銆佷富椤靛崱鐗囬厤鑹蹭竴鑷村寲锛涚┖鐘舵€佹洿鍙嬪ソ銆?
#  5) 鏇村仴澹殑鏁版嵁鍑嗗锛氭樉寮忚瀹?class 鍥犲瓙姘村钩锛圦ualified < Unqualified锛夈€?
#  6) 鏇村弸濂界殑鏍￠獙涓庢秷鎭紱plot/琛ㄦ牸鍔犺浇鐘舵€佸彲閫夋敮鎸侊紙shinycssloaders锛夈€?
# =============================================================

# 浣跨敤shinyapps.io骞冲彴閮ㄧ讲
# rsconnect::setAccountInfo(name='bufferpackdesigner', token='D02E4FF53F022F65A21417067A319C7A', secret='yfDRNXLim3esJa8bd6xt4ihwJUnvJfC7KONjJTx6')
# rsconnect::deployApp()  # 鑷姩鎵撳寘 app.R銆亀ww/銆佷緷璧栫瓑

# ---- 鍔犺浇渚濊禆鍖?----
library(rsconnect)
library(shiny)
library(ggplot2)
library(dplyr)
library(readxl)
library(DT)
library(yardstick)
library(tidyr)
library(tibble)
library(rsample)

# 濡傛灉shinycssloaders鍖呭瓨鍦紝鍒欏惎鐢ㄥ姞杞藉姩鐢伙紙use_spinner锛?
suppressWarnings({
  if (requireNamespace("shinycssloaders", quietly = TRUE)) {
    use_spinner <- TRUE
  } else {
    use_spinner <- FALSE
  }
})

suppressPackageStartupMessages({
  library(ggplot2)
  library(gridExtra)
  library(grid)
  library(tune)
  library(workflowsets)
  library(workflows)
  library(patchwork)   # 鈫?鏂板杩欎竴琛?
})


# ---- 鑷畾涔塮unction ----
# 浠庤缁冪殑鏈哄櫒瀛︿範妯″瀷瓒呭弬鏁癿l_results鐢熸垚绠楁硶瀵规瘮鍥?
plot_ml_rank <- function(ml_results, layout = c("horizontal","vertical")) {
  layout <- match.arg(layout)
  
  # 灏濊瘯鎷垮彲鐢ㄦ寚鏍?
  mets <- tryCatch({
    workflowsets::collect_metrics(ml_results)$.metric
  }, error = function(e) NULL)
  
  # 鍘婚噸
  mets <- unique(mets)
  
  # 鍒嗙被浼樺厛鎸囨爣
  has_acc    <- "accuracy" %in% mets
  has_auc    <- "roc_auc"  %in% mets
  
  # 鍥炲綊浼樺厛鎸囨爣
  has_rsq    <- "rsq"   %in% mets
  has_rmse   <- "rmse"  %in% mets
  
  # 鎯呭喌A锛氬垎绫诲瀷锛堟湁 accuracy / roc_auc锛?
  if (has_acc || has_auc) {
    
    # 瀹夊叏鍦扮敾 accuracy 鍥撅紙鏈夋墠鐢伙級
    plot_acc <- NULL
    if (has_acc) {
      plot_acc <- autoplot(
        ml_results,
        rank_metric = "accuracy",
        metric = "accuracy",
        select_best = TRUE
      ) +
        geom_text(
          aes(y = mean - 0.02, label = wflow_id),
          angle = 90, hjust = 1.2
        ) +
        lims(y = c(.50, 1)) +
        theme_bw() +
        theme(legend.position = "none") +
        labs(
          x = "Machine learning algorithm",
          y = "Accuracy"
        )
    }
    
    # 瀹夊叏鍦扮敾 AUC 鍥撅紙鏈夋墠鐢伙級
    plot_auc <- NULL
    if (has_auc) {
      plot_auc <- autoplot(
        ml_results,
        rank_metric = "roc_auc",
        metric = "roc_auc",
        select_best = TRUE
      ) +
        geom_text(
          aes(y = mean - 0.02, label = wflow_id),
          angle = 90, hjust = 1.2
        ) +
        lims(y = c(.50, 1)) +
        theme_bw() +
        theme(legend.position = "none") +
        labs(
          x = "Machine learning algorithm",
          y = "ROC AUC"
        )
    }
    
    suppressPackageStartupMessages(library(patchwork))
    
    # 濡傛灉涓や釜鍥鹃兘鏈夛紝鎷煎湪涓€璧?
    if (!is.null(plot_acc) && !is.null(plot_auc)) {
      return(if (layout == "vertical") (plot_acc / plot_auc) else (plot_acc | plot_auc))
    }
    
    # 濡傛灉鍙湁涓€涓浘锛堟瘮濡傚彧鏈?accuracy锛屾病鏈?auc锛夛紝閭ｅ氨杩斿洖瀹?
    if (!is.null(plot_acc)) return(plot_acc)
    if (!is.null(plot_auc)) return(plot_auc)
  }
  
  # 鎯呭喌B锛氬洖褰掑瀷锛堢敤 rsq / rmse 绛夛級
  if (has_rsq || has_rmse) {
    
    plot_rsq <- NULL
    if (has_rsq) {
      plot_rsq <- autoplot(
        ml_results,
        rank_metric = "rsq",
        metric = "rsq",
        select_best = TRUE
      ) +
        geom_text(
          aes(y = mean, label = wflow_id),
          angle = 90, hjust = 1.2, vjust = 1.1
        ) +
        theme_bw() +
        theme(legend.position = "none") +
        labs(
          x = "Machine learning algorithm",
          y = "R-squared"
        )
    }
    
    plot_rmse <- NULL
    if (has_rmse) {
      plot_rmse <- autoplot(
        ml_results,
        rank_metric = "rmse",
        metric = "rmse",
        select_best = TRUE
      ) +
        geom_text(
          aes(y = mean, label = wflow_id),
          angle = 90, hjust = 1.2, vjust = 1.1
        ) +
        theme_bw() +
        theme(legend.position = "none") +
        labs(
          x = "Machine learning algorithm",
          y = "RMSE (lower is better)"
        )
    }
    
    suppressPackageStartupMessages(library(patchwork))
    
    if (!is.null(plot_rsq) && !is.null(plot_rmse)) {
      return(if (layout == "vertical") (plot_rsq / plot_rmse) else (plot_rsq | plot_rmse))
    }
    if (!is.null(plot_rsq))  return(plot_rsq)
    if (!is.null(plot_rmse)) return(plot_rmse)
  }
  
  # 鎯呭喌C锛氭棦涓嶆槸鍒嗙被涔熶笉鏄洖褰掑彲璇嗗埆鎸囨爣
  stop("No supported metrics (accuracy/roc_auc/rsq/rmse) found in ml_results.")
}



# ---- UI妗嗘灦 ----
ui <- fluidPage(
  # 鑷畾涔塙I椋庢牸
  tags$head(
    tags$link(rel = "stylesheet", href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css"),
    tags$link(rel = "stylesheet", href = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css"),
    tags$script(HTML("
      Shiny.addCustomMessageHandler('setActive', function(x){
        var el = document.getElementById(x.id);
        if(!el) return;
        if(x.active){ el.classList.add('active'); } else { el.classList.remove('active'); }
      });
      function wireDropdown(rootId, subId){
      var root = document.getElementById(rootId);
      var sub  = document.getElementById(subId);
      if(!root || !sub) return;
      root.addEventListener('click', function(ev){
      ev.preventDefault();                 // 涓嶆妸鐐瑰嚮褰撲綔璺宠浆
      sub.classList.toggle('open');        // 灞曞紑/鏀惰捣
      root.classList.toggle('is-open');    // 鍥炬爣鏃嬭浆绛夛紙鍙€夛級
      });
      }
      document.addEventListener('DOMContentLoaded', function(){
      wireDropdown('nav_cls_root', 'menu_cls_sub'); // Damage analysis
      wireDropdown('nav_reg_root', 'menu_reg_sub'); // Acceleration prediction
      });
    ")),
    
    tags$style(HTML("
      body { font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color:#F5F7FB; margin:0; padding:0; }
      #app { display:flex; height:100vh; overflow:hidden; }
      /* Sidebar */
      #sidebar { width:260px; background:#F7F9FC; padding:25px 20px; border-right:1px solid #E5E5E5; position:relative; }
      #sidebar .logo-row { display:flex; align-items:center; margin-bottom:30px; }
      #sidebar .logo { width:34px; height:34px; border-radius:8px; }
      #sidebar .logo-row span { font-weight:700; font-size:20px; color:#4F4F4F; margin-left:10px; }
      .section-title { text-transform:uppercase; font-size:11px; letter-spacing:1px; color:#B2B2B2; margin:18px 0 8px; }
      .menu-item { display:flex; align-items:center; margin-bottom:10px; padding:9px 12px; border-radius:10px; color:#6E6E6E; font-size:14px; cursor:pointer; transition:background-color .15s, color .15s; text-decoration:none; }
      .menu-item i { margin-right:10px; }
      .menu-item.active { background-color:#7C63F6; color:#fff; }
      .menu-item:hover { background-color:#ECE8FF; color:#5A46C8; }
      .menu-group { margin-bottom:16px; display:flex; flex-direction:column; gap:12px; }
      .menu-item.menu-root { font-weight:600; flex-direction:column; justify-content:center; text-align:center; gap:6px; min-height:64px; padding:10px 8px; margin-bottom:0; }
      .menu-item.menu-root i { margin-right:0; margin-bottom:0; font-size:17px; line-height:1; }
      .menu-item.menu-root span { display:block; font-size:12px; line-height:1.2; }
      .menu-item.menu-sub { font-size:13px; padding-left:36px; color:#7A7A7A; }
      .menu-item.menu-sub i { font-size:12px; margin-right:8px; }
      .submenu { display:none; margin-top:6px; }
      .menu-item.menu-has-children::after { content:'\\f105'; font-family:'Font Awesome 5 Free'; font-weight:900; margin-left:auto; transition:transform .2s; }
      .menu-item.menu-has-children.active::after { transform:rotate(90deg); }
      .menu-item.menu-root.menu-has-children + .submenu { padding-left:4px; border-left:1px dashed #d8d6f6; margin-left:12px; }
      .submenu { display: none; }
      .submenu.open { display: block; }
      .menu-has-children.is-open .drop-caret { transform: rotate(180deg); }
      .menu-item.menu-sub.active { background-color:#EDE8FF; color:#5A46C8; }
      a.menu-item, a.menu-item:visited, a.menu-item:hover, a.menu-item:active { text-decoration:none !important; outline:none; }
      #sidebar #exit-block { position:absolute; bottom:20px; left:20px; right:20px; }
      /* Main */
      #main { flex:1; padding:28px 36px; overflow-y:auto; }
      #header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:26px; }
      #welcome { font-size:26px; font-weight:700; color:#2B2B2B; line-height:1.2; }
      .card { background:#fff; border-radius:16px; box-shadow:0 4px 8px rgba(0,0,0,0.05); padding:20px; margin-bottom:18px; }
      .card h4 { margin:0 0 12px 0; font-size:16px; font-weight:600; color:#2B2B2B; }
      .card-purple { background:linear-gradient(135deg, #7C63F6 0%, #9D71E3 100%); color:#fff; }
      .card-purple h4, .card-purple p, .card-purple h3 { color:#fff; }
      .primary-button { background:#fff; color:#7C63F6; border:none; border-radius:10px; padding:8px 16px; font-weight:600; cursor:pointer; }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); grid-gap:16px; }
      .row { display:grid; grid-template-columns: 1fr 1fr; grid-gap:16px; }
      @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
      .muted { color:#8F8F8F; font-size:13px; }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); grid-gap:16px; }
      .grid--rows2 { display:grid; grid-template-columns:1fr; grid-auto-rows:minmax(0, auto); grid-gap:16px; }
      .grid--col2 { display: grid; grid-template-columns: repeat(2, 1fr); grid-gap: 16px; }
      .grid--grid2x2 { display: grid;grid-template-columns: repeat(2, 1fr); grid-template-rows: auto auto; align-items: stretch;}
      .placeholder { color:#6E6E6E; font-size:14px; }
      #img_view img, #img_view img {max-width: 100%;height: auto;display: block;margin: 0 auto;border-radius: 8px;}
      #img_view, #img_view { max-width:100%; height:auto; display:block; margin:0 auto; border-radius:8px; }
      .dataTables_wrapper .dt-buttons { margin: 6px 0; }
      table.dataTable tbody td { white-space: nowrap; }  /* 涓嶆崲琛岋紝閰嶅悎姘村钩婊氬姩 */
      .my-row { display:grid; grid-template-columns: 1fr 1fr; grid-gap:16px; }
      .menu-has-children::after { content: none !important; }
      #nav_cls_root.menu-has-children::after { content: none !important; }
      #nav_reg_root.menu-has-children::after { content: none !important; }
      .dropdown-toggle::after { display: none !important; }
      #nav_cls_root .bi.bi-chevron-down,
      #nav_cls_root .bi.bi-chevron-up,
      #nav_reg_root .bi.bi-chevron-down,
      #nav_reg_root .bi.bi-chevron-up { display: none !important; }
      .drop-caret { transition: transform .15s ease-in-out; }
      .menu-has-children.is-open .drop-caret { transform: rotate(180deg); }
      .submenu,
      .submenu.show {border-left: none !important;background-image: none !important;box-shadow: none !important;}
      .submenu::before,
      .submenu::after { display: none !important; }
      #sidebar { padding-left: 0px; }
      @media (max-width: 992px){#sidebar { padding-left: 0px; }}
      #sidebar .submenu .menu-sub {padding-left: 15px;margin-left: 0;}
      #menu_cls_sub, #menu_reg_sub {padding-left: 8px;margin-left: 0;border-left: none;}
      #sidebar .menu-sub .bi { margin-right: 6px; }
      .plot-box { width:80%; max-width:80%; overflow:auto; box-sizing:border-box; }
      .plot-placeholder{
      display:flex; align-items:center; justify-content:center;
      height: 200px;
      color:#6E6E6E; background:#FAFAFF; 
      border:1px dashed #d8d6f6; border-radius:12px;
      font-size:14px; text-align:center; padding:16px;
      }

                    ")
               )
    ),
  
  # ---- 鑷畾涔塙I瀹瑰櫒----
  div(
    id = "app",
    # ---- 鑷畾涔変晶杈规爮----
    div(
      id = "sidebar", class = "stack",
      div(class = "logo-row",
          tags$img(src = "images/Logo.png", class = "logo", style = "width:30px; height:30px; border-radius:8px; object-fit:cover;"),
          span("CushionPack Studio", class = "logo-title", style = "font-size:18px;")
          ),
      # div(class = "section-title", "Navigation"),
      # ---- Home ----
      div(class = "menu-group",actionLink("nav_home", label = tagList(tags$i(class = "fas fa-home"), span("Home")), class = "menu-item menu-root")),
      # ----analysis ----
      div(class = "section-title", "Analysis"),
      div(id = "menu_cls_sub", class = "menu-group",
          actionLink("nav_model", label = tagList(tags$i(class = "bi bi-database-fill"), span("Model preview")), class = "menu-item menu-root"),
          actionLink("nav_data", label = tagList(tags$i(class = "bi bi-upload"), span("Data upload")), class = "menu-item menu-root"),
          actionLink("nav_prediction", label = tagList(tags$i(class = "bi bi-magic"), span("Prediction")), class = "menu-item menu-root")),
      # ---- Others ----
      div(class = "section-title", "Tool"),
      # ---- Exit -----
      div(id = "exit-block",
          actionButton("btn_exit", label = "Exit", icon = icon("sign-out-alt"),
                       style = "width:50%; background-color:#E05A47; color:#fff; border:none; font-size:15px; border-radius:10px; padding:12px 18px;"))
    ),
    
    # ---- 鑷畾涔変富鏄剧ず鍖?---
    div(
      id = "main",
      div(
        id = "header",
        div(id = "welcome",
            HTML('<div style="font-size:25px; font-weight:700; color:#590d82; text-align:center; line-height:1.2;">Hi, Welcome to CushionPack Studio馃憢</div>')),
        div(style = "display:flex; gap:20px; align-items:center;")
      ),
      
      div(id = "page_container", uiOutput("page_body"))
    )
  )
)



# ---- Server閮ㄧ讲 ----
options(shiny.maxRequestSize = 100*1024^2)  # 澧炲姞涓婁紶鏁版嵁鐨勫ぇ灏?
server <- function(input, output, session) {
  # ---- 閮ㄧ讲瀵艰埅鏍忕姸鎬佸姛鑳?----
  current_tab <- reactiveVal("home")
  
  # 浜岀骇椤癸細鍚勮嚜鍐欏叆鐙珛鐨?tab
  observeEvent(input$nav_home,           { current_tab("home") })
  observeEvent(input$nav_model,      { current_tab("cls_model") })
  observeEvent(input$nav_data,     { current_tab("cls_upload") })
  observeEvent(input$nav_prediction, { current_tab("cls_prediction") })

  observeEvent(current_tab(), {
    nav_map <- list(
      nav_home           = "home",
      
      nav_model      = "cls_model",
      nav_data     = "cls_upload",
      nav_prediction = "cls_prediction"
    )
    
    for (id in names(nav_map)) {
      target <- nav_map[[id]]
      session$sendCustomMessage(
        "setActive",
        list(id = id, active = current_tab() %in% target)
      )
    }
  }, ignoreInit = FALSE)
  
  # 鍒濆浠呴珮浜?Home
  session$onFlushed(function(){
    nav_ids <- c("nav_home", "nav_model", "nav_data", "nav_prediction")
    for (id in nav_ids) {
      session$sendCustomMessage("setActive", list(id = id, active = identical(id, "nav_home")))
    }
  })
  
  # ---- 妯″瀷璇诲彇鍔熻兘 ----
  read_model <- function(path){
    if (!file.exists(path)) return(NULL)
    tryCatch(readRDS(path), error = function(e) NULL)
    }
  
  # ---- 璇诲彇妯″瀷鍚庣粯鍥剧畻娉曞姣?----
  cache_ml_rank <- reactiveVal(NULL)
  cache_rds_file <- reactiveVal(NULL)
  cache_performance_plot <- reactiveVal(NULL)
  cache_data_train <- reactiveVal(NULL)
  cache_data_test  <- reactiveVal(NULL)
  cache_data_split <- reactiveVal(NULL)
  cache_data_ml <- reactiveVal(NULL)
  cache_best_algorithm <- reactiveVal(NULL)
  cache_best_params <- reactiveVal(NULL)
  cache_ml_metrics <- reactiveVal(NULL)
  
  # -----
  output$ml_rank_plot <- renderPlot({
    req(cache_ml_rank())
    cache_ml_rank()
  }, res = 120,
  height = function() {
    w <- session$clientData$output_ml_rank_plot_width
    # 鍥哄畾姣斾緥锛氶珮 = 瀹?* 9/16锛屽苟闄愬畾鍦ㄥ尯闂村唴
    h <- round(w * 3/3)
    min(520, max(380, h))   # 涓嬮檺 380锛屼笂闄?520锛堝彲鎸夊崱鐗囬珮搴﹁皟鏁达級
  },
  width = "auto")

  output$ml_rank_plot_box <- renderUI({
    if (is.null(cache_ml_rank())) {
      # 鏈笂浼狅細鏄剧ず鍗犱綅鎻愰啋
      div(class = "plot-placeholder",
          HTML("馃搫 Please upload .rds file to view the model ranking chart"))
    } else {
      # 宸蹭笂浼狅細鏄剧ず鍥惧鍣?
      plotOutput("ml_rank_plot", width = "100%")
    }
  })

  # 缁樺浘杈撳嚭锛堝惈 4:3 鑷€傚簲 & 鍗犱綅鎻愮ず锛?
  output$cls_cm_plot <- renderPlot({
    req(cache_performance_plot())
    cache_performance_plot()
  }, res = 300,
  height = function(){
    w <- session$clientData$output_cls_cm_plot_width
    h <- round(w * 3/4)        # 4:3 姣斾緥
    min(520, max(360, h))
  },
  width = "auto")
  
  output$cls_cm_box <- renderUI({
    if (is.null(cache_performance_plot())) {
      # 鏈笂浼狅細鏄剧ず鍗犱綅鎻愰啋
      div(class = "plot-placeholder",
          HTML("馃搫 Please upload .rds file and select an algorithm"))
    } else {
      # 宸蹭笂浼狅細鏄剧ず鍥惧鍣?
      plotOutput("cls_cm_plot", width = "100%")
    }
  })
  
  
  
  # 鎶婂璞″瓨璧锋潵锛屽苟椤烘墜濉厖绠楁硶涓嬫媺妗?
  observeEvent(input$model_rds, {
    req(input$model_rds$datapath)
    withProgress(message = "Loading the trained model hyperparameter file", value = 0, {
      incProgress(0.2, detail = "Reading .rds file")
      obj <- tryCatch(readRDS(input$model_rds$datapath), error = function(e) NULL)
      validate(need(!is.null(obj), "Invalid model hyperparameter file"))

      # 缂撳啿obj锛屽叾瀹冨姛鑳介儴鍒嗘彁鍙栧悗鐢ㄥ埌
      cache_rds_file(obj)
      
      # ---- 1) 鐢熸垚绠楁硶鎺掑悕鍥撅紙绔栨帓锛?----
      incProgress(0.2, detail = "Computing rank plots")
      ml_rank_plot <- tryCatch(plot_ml_rank(obj, layout = "vertical"), error = function(e) NULL)
      validate(need(!is.null(ml_rank_plot), "Failed to compute rank plots."))
      cache_ml_rank(ml_rank_plot)
      
      # ---- 2) 浠?obj 涓娊鍙栨暟鎹 data_ml ----
      incProgress(0.2, detail = "Extracting data_ml from object")
      data_ml <- tryCatch(
        {tibble::as_tibble((obj[[4]][[1]])[[1]][[1]][["data"]]
                           )
      }, error = function(e) NULL)
      validate(need(is.data.frame(data_ml) && nrow(data_ml) > 1,
                    "Cannot extract ml_data from the .rds object"))
      cache_data_ml(data_ml)
      
      # ---- 3) 8:2 鍒嗗眰鍒掑垎璁粌/娴嬭瘯 ----
      incProgress(0.2, detail = "Split train dataset and test dataset")
      data_split <- rsample::initial_split(data_ml, prop = 0.8, strata = class)
      data_train <- rsample::training(data_split)
      data_test  <- rsample::testing(data_split)
      
      # 淇濆瓨鍒?reactiveVal锛屼緵鍚庣画妯″潡锛堜緥濡傛贩娣嗙煩闃电粯鍒讹級鐩存帴浣跨敤
      cache_data_split(data_split)
      cache_data_train(data_train)
      cache_data_test(data_test)
      
      # ---- 4) 鑷姩濉厖绠楁硶涓嬫媺妗?----
      wf_ids <- tryCatch({
        workflowsets::collect_metrics(obj) %>%
          dplyr::distinct(wflow_id) %>%
          dplyr::arrange(wflow_id) %>%
          dplyr::pull(wflow_id)
      }, error = function(e) character(0))
      
      updateSelectInput(session, "select_algorithm",
                        choices  = if (length(wf_ids)) wf_ids else NULL,
                        selected = if (length(wf_ids)) wf_ids[[1]] else character(0))
      
      incProgress(0.2, detail = "Done")
    })
  }, ignoreInit = TRUE)
  
  
  #  2) 鈥滈€夋嫨鏈€浣宠秴鍙傗€?+ 鏄剧ず鍦ㄨ〃鏍硷紙DT锛夐噷
  output$select_best_params <- DT::renderDT({
    wfs <- req(cache_rds_file())
    alg <- input$select_algorithm
    cache_best_algorithm(alg)
    
    validate(need(nzchar(alg), "Please pick an algorithm."))
    
    # 鎷垮埌璇ョ畻娉曠殑 tune_results
    tr <- tryCatch(workflowsets::extract_workflow_set_result(wfs, alg),
                   error = function(e) NULL)
    validate(need(!is.null(tr), "No tuning results found for the selected algorithm."))
    metrics <- unique(collect_metrics(tr)$.metric) # 鎻愬彇鍙敤鎸囨爣
    cache_ml_metrics(metrics)
    # roc_auc 涓婄殑鏈€浣冲弬鏁拌
    best <- tryCatch({
      # 鑷姩閫夋嫨锛岄鍏堬紝鍒嗙被roc_auc锛屽叾娆″洖褰抮sq
      metric_used <- if ("roc_auc" %in% metrics) {
        "roc_auc"
      } else if ("rsq" %in% metrics) {
        "rsq"
      } else {
        stop("Neither roc_auc nor rsq metric found in tuning results.")
      }
      
      tune::select_best(tr, metric = metric_used)
    }, error = function(e) NULL)
    
    validate(need(!is.null(best),
                  "Cannot select best by roc_auc or rsq 鈥?metrics missing in model?"))
    cache_best_params(best)
    DT::datatable(best, options = list(dom = "t", scrollX = TRUE))
    
  })
  
  
  #  3) 璇诲彇妯″瀷璺緞鍚庢彁鍙栨暟鎹垱寤烘贩娣嗙煩闃?
  # 鑷姩锛氭ā鍨嬪氨缁?+ 绠楁硶閫夋嫨 + 璁粌/娴嬭瘯闆嗗氨缁?鈫?鐩存帴鎷熷悎骞剁粯鍥?
  observeEvent(
    list(
      cache_rds_file(),
      input$select_algorithm,
      cache_data_train(),
      cache_data_test(),
      cache_best_params(),
      cache_best_algorithm()
    ),
    {
      wfs <- cache_rds_file()
      alg_input <- input$select_algorithm
      best      <- cache_best_params()
      alg_best  <- cache_best_algorithm()
      data_train <- cache_data_train()
      data_test  <- cache_data_test()
      data_ml    <- cache_data_ml()
      data_split <- cache_data_split()
      
      # 鍙鏈変换浣曞叧閿笢瑗挎病鍑嗗濂斤紝灏辨竻绌哄浘骞堕€€鍑?
      if (is.null(wfs)          ||
          is.null(alg_input)    || !nzchar(alg_input) ||
          is.null(best)         ||
          is.null(alg_best)     || !nzchar(alg_best)  ||
          is.null(data_train)   ||
          is.null(data_test)    ||
          is.null(data_ml)      ||
          is.null(data_split)) {
        
        cache_performance_plot(NULL)
        return()
      }
      
      withProgress(message = "Fitting finalized model...", value = 0, {
        incProgress(0.3, detail = "Finalizing and fitting model")
        
        # 鐢?best 瓒呭弬鍜?data_split 鎷熷悎鏈€缁堟ā鍨?
        final_model <- tryCatch({
          wfs %>%
            workflowsets::extract_workflow(alg_best) %>%
            tune::finalize_workflow(best) %>%
            tune::last_fit(split = data_split) %>%
            tune::extract_workflow()
        }, error = function(e) NULL)
        
        validate(need(!is.null(final_model), "Model fitting failed."))
        
        # 棰勬祴鍏ㄩ噺鏁版嵁
        incProgress(0.5, detail = "Predicting on all data")
        preds_all <- tryCatch({
          predict(final_model, data_ml)
        }, error = function(e) NULL)
        
        validate(need(!is.null(preds_all),
                      "Prediction failed 鈥?model did not return predictions."))
        
        plot_df <- dplyr::bind_cols(data_ml, preds_all)
        
        # 妫€娴嬩换鍔＄被鍨?
        is_cls <- ".pred_class" %in% names(plot_df)
        is_reg <- ".pred"       %in% names(plot_df)
        
        # 鍒嗙被浠诲姟锛氱敾娣锋穯鐭╅樀
        if (is_cls) {
          incProgress(0.7, detail = "Computing confusion matrix")
          
          validate(need("class" %in% names(plot_df),
                        "Column 'class' not found in prediction dataset (classification)."))
          
          plot_df <- plot_df %>%
            dplyr::mutate(
              class       = factor(class,       levels = c("Qualified","Unqualified")),
              .pred_class = factor(.pred_class, levels = c("Qualified","Unqualified"))
            )
          
          cm_cls <- yardstick::conf_mat(plot_df, truth = class, estimate = .pred_class)
          acc_val <- yardstick::accuracy_vec(
            truth    = plot_df$class,
            estimate = plot_df$.pred_class
          )
          
          cmplot_cls <- autoplot(cm_cls, type = "heatmap") +
            scale_fill_gradient(low = "#d7ecfb", high = "#fbc1d0") +
            ggtitle(sprintf("Confusion matrix  |  Acc = %.3f", acc_val)) +
            theme(
              axis.title   = element_text(face = "bold", size = 10),
              axis.text    = element_text(face = "bold", size = 10),
              legend.title = element_text(face = "bold", size = 10),
              legend.text  = element_text(size = 10)
            )
          
          cache_performance_plot(cmplot_cls)
          incProgress(1)
          return()
        }
        
        # 鍥炲綊浠诲姟锛氱敾鏁ｇ偣 + 娈嬪樊
        if (is_reg) {
          incProgress(0.7, detail = "Computing regression diagnostics")
          
          validate(need("Accelerated_speed" %in% names(plot_df),
                        "Column 'Accelerated_speed' not found in prediction dataset (regression)."))
          
          reg_df <- plot_df %>%
            dplyr::mutate(
              Actual    = Accelerated_speed,
              Predicted = .pred,
              Residual  = .pred - Accelerated_speed
            )
          
          p_scatter <- ggplot(reg_df, aes(x = Actual, y = Predicted)) +
            geom_point(alpha = .6) +
            geom_smooth(method = lm, se = TRUE, size = 0.8) +
            theme_bw() +
            labs(
              title = "Actual vs Predicted",
              x = "Actual accelerated speed",
              y = "Predicted accelerated speed"
            )
          
          p_resid <- ggplot(reg_df, aes(x = Residual)) +
            geom_histogram(bins = 30, alpha = .8) +
            theme_bw() +
            labs(
              title = "Residual distribution",
              x = "Residual (Predicted - Actual)",
              y = "Count"
            )
          
          reg_plot_combo <- p_scatter | p_resid
          
          cache_performance_plot(reg_plot_combo)
          incProgress(1)
          return()
        }
        
        # 濡傛灉鏃笉鏄垎绫讳篃涓嶆槸鍥炲綊锛堟瀬灏戞暟鎯呭喌锛?
        cache_performance_plot(NULL)
        showNotification("No .pred_class or .pred found in predictions; cannot visualize.", type = "error")
      })
    },
    ignoreInit = TRUE
  )
  
  
  

  # ---- 鏁版嵁瀵煎叆鍔熻兘 ----
  read_data <- function(path) {
    ext <- tolower(tools::file_ext(path)) # 鎻愬彇鏂囦欢鎵╁睍鍚嶅苟杞负灏忓啓锛屼緥濡?"XLSX" -> "xlsx"
    if (ext %in% c("xlsx", "xls")) # 濡傛灉鎵╁睍鍚嶆槸 xlsx 鎴?xls
      readxl::read_excel(path) # 鍒欎娇鐢?readxl 鍖呯殑 read_excel() 璇诲彇 Excel 鏂囦欢
    else 
      read.csv(path, stringsAsFactors = FALSE) # 鍚﹀垯锛岄粯璁ゅ綋浣?CSV 鏂囦欢璇诲彇锛屼笖涓嶈嚜鍔ㄦ妸瀛楃涓茶浆涓哄洜瀛?
  }


  # ---- 鏁版嵁棰勫鐞嗗姛鑳斤紙寰呬慨鏀癸級 ----
  prepare_data <- function(dat, labeled = TRUE) {
    new_names <- c("ID","M_Length","M_Width","M_Height","L_Category","L_Density","L_Thickness","P_Length","P_Width","P_Height","Accelerated_speed")
    if (ncol(dat) >= length(new_names)) names(dat)[1:length(new_names)] <- new_names
    dat <- tibble::as_tibble(dat)
    
    if ("L_Category" %in% names(dat)) {
      dat <- dat %>% mutate(
        L_Category_Num = dplyr::case_when(
          L_Category == "EPE" ~ 1,
          L_Category == "EPP" ~ 2,
          L_Category == "EPS" ~ 3,
          TRUE ~ NA_real_
        )
      )
    }
    
    if (labeled && "Accelerated_speed" %in% names(dat)) {
      dat <- dat %>% mutate(class = dplyr::if_else(Accelerated_speed > 60, "Unqualified", "Qualified"))
    }
    
    # 鏄惧紡璁惧畾浜屽垎绫绘按骞抽『搴忥細Qualified(闃存€? < Unqualified(闃虫€?
    if ("class" %in% names(dat)) {
      dat <- dat %>% mutate(class = factor(class, levels = c("Qualified", "Unqualified")))
    }
    dat
  }


  # ---- reactive 琛ㄨ揪寮忥細瀵煎叆鏁版嵁+璇嗗埆鏁版嵁+鏁版嵁棰勫鐞?杩斿洖澶勭悊鍚庣粨鏋?----
  df_labeled <- reactive({
    req(input$file_labeled_data$datapath)
    raw <- tryCatch(read_data(input$file_labeled_data$datapath), error = function(e) NULL)
    validate(need(!is.null(raw), "Please upload labeled CSV/XLSX."))
    prepare_data(raw, labeled = TRUE)
  })
  
  
  # ---- reactive 琛ㄨ揪寮忥細瀵煎叆鏁版嵁+璇嗗埆鏁版嵁+鏁版嵁棰勫鐞?杩斿洖澶勭悊鍚庣粨鏋?----
  df_unknown <- reactive({
    req(input$file_unknown$datapath)
    raw <- tryCatch(read_data(input$file_unknown$datapath), 
                    error = function(e) NULL)
    validate(need(!is.null(raw), "Please upload unknown CSV/XLSX."))
    prepare_data(raw, labeled = FALSE)
  })
  
  # renderPlot()鐢熸垚浜や簰寮忓浘鐗?
  output$plt_corr <- renderPlot({
    d <- req(df_labeled())
    num <- d %>% dplyr::select(where(is.numeric))
    validate(need(ncol(num) >= 2, "Need at least two numeric columns."))
    cmat <- suppressWarnings(cor(num, use = "complete.obs"))
    long <- as.data.frame(cmat) %>% tibble::rownames_to_column("Var1") %>% tidyr::pivot_longer(-Var1, names_to = "Var2", values_to = "r")
    ggplot(long, aes(Var1, Var2, fill = r)) +
      geom_tile() +
      geom_text(aes(label = sprintf("%.2f", r)), size = 3, color = "#2B2B2B") +
      scale_fill_gradient2(low = "#4EA8DE", mid = "#FFFFFF", high = "#9D71E3", midpoint = 0) +
      theme_minimal(base_size = 11) +
      theme(axis.text.x = element_text(angle = 45, hjust = 1))
  }, res = 110)
  
  # ---- 椤甸潰鍐呭锛堟牴鎹?current_tab 鍒囨崲锛?----
  output$page_body <- renderUI({
    # 涓€涓皬宸ュ叿锛氭湁鏃犱笂浼?labeled/unknown 鐨勫崰浣嶆彁绀?
    ph <- function(txt) div(class = "card", div(class = "placeholder", txt))
    
    # 鍖呰９鍣細濡傛灉瑁呬簡 shinycssloaders锛屽氨缁?Output 鍔?spinner
    withMaybeSpinner <- function(x) {
      if (isTRUE(use_spinner)) shinycssloaders::withSpinner(x, type = 6) else x
    }
    switch(current_tab(),
           # ---- Home鍐呭 ----
           "home" = tagList(
             div(class = "grid--rows2",
                 div(class = "card card-purple",
                     h3("CushionPack Studio", style = "font-weight:bold; margin-top:0; margin-bottom:16px; line-height:1;"),
                     p("CushionPack Studio is a finite element simulation data-based and machine learning-driven platform 
                   that evaluates the effectiveness of buffer packaging for display-screen products. 
                   Enter your candidate solutions-product, buffer material and outer packaging information,.etc-and CushionPack Studio delivers data-driven the insight to guide lighter and more cost-effective decisions.",
                       style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:white; margin-top:0px; margin-bottom:1px; line-height:1.6;")
                 ),
                 
                 div(class = "grid--col2", #grid--col2
                     div(
                       class = "card", # 绱壊鍙樹綋锛歝ard card-purple
                       h3("Data Visualization",
                          style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                       p("The solution empowers users to quickly input packaging scheme data or upload file data.",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1.5;"),
                       p("馃帇 Numeric input",
                         style = "font-size:14px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1.2;"),
                       p("鉁?File input",
                         style = "font-size:14px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1.2;"),
                       p("馃挌 Data preview",
                         style = "font-size:14px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1.2;")
                     ),
                     
                     div(
                       class = "card",
                       h3("Machine Learning Algorithm",
                          style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                       p("Multiple machine learning algorithms provide the foundation for an accurate packaging solutions.",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1.5;"),
                       # tags$img(src = "images/Machine learning.png", id = "img_view",style = "width:200px; height:200px; border-radius:2px; object-fit:cover;"),
                       p("鉁?Random forest (RF)",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;"),
                       p("鉁?Linear discriminant analysis (LDA)",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;"),
                       p("鉁?Support vector machine (SVM)",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;"),
                       p("鉁?Extreme gradient boosting (XGBoost)",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;"),
                       p("鉁?Neural network (BPNN)",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;"),
                       p("鉁?......",
                         style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1;")
                     )
                 ),
                 
                 div(class = "grid--col2", #grid--col2
                   div(
                     class = "card",
                     h3("Damage Anlysis",style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                     p("Based on the input product packaging parameter, breakage discrimination can be conducted via classification analysis.",
                       style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1.5;"
                     ),
                     
                     div(
                       class = "grid--col2", #grid--col2
                       div(
                         class = "card",
                         h4("Algorithm selection",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         tags$img(src = "images/Algorithm selection.png", id = "img_view")
                         ),
                       div(
                         class = "card",
                         h4("Classification",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         tags$img(src = "images/Confusion matrix_XGBoost.png", id = "img_view")
                         )
                       )
                     ),
                   
                   div(
                     class = "card",
                     h3("Acceleration prediction",style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                     p("Based on the input product packaging parameter, peak acceleration value prediction can be conducted via regression analysis.",
                       style = "font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:4px; line-height:1.5;"
                     ),
                     
                     div(
                       class = "grid--col2", #grid--col2
                       div(
                         class = "card",
                         h4("Algorithm selection",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         tags$img(src = "images/Algorithm selection.png", id = "img_view")
                       ),
                       div(
                         class = "card",
                         h4("Regression",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         tags$img(src = "images/Regression_RF_Train.png", id = "img_view")
                       )
                     )
                   )
                 )
             )
           ),
           
           # ---- 妯″瀷棰勮 ----
           "cls_model" = tagList(
             div(class = "card",
                   h3("Machine Model Performance", 
                    style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                 p("You can upload the machine learning model, and preview the performance of each model based on multiple machine learning algorithm.",
                   style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1;"),
                 
                 div(class = "grid",
                     div(class = "card",
                       h4("1. Upload model",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                       p("Upload the integrated machine learning model data file (.rds).",
                         style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                       fileInput("model_rds", label = NULL, accept = c(".rds"), buttonLabel = "Browse", placeholder = "Select .rds model file..."),
                       tags$hr(),
                       div(
                         h4("2. Accuracy ranking",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         id = "ml_plot_box",
                         class = "plot-box",
                         uiOutput("ml_rank_plot_box")
                         )
                       ),
                     
                     div(class = "card",
                         h4("3. Model selection",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         p("Select the machine learning algorithm to examine.",
                           style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                         selectInput("select_algorithm", "", choices = c("Please upload .rds file" = ""), width = "80%"),
                         tags$hr(),
                         
                         h4("4. Best hyper-parameters",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         p("Select the machine learning algorithm.",
                           style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                         DT::DTOutput("select_best_params"),
                         tags$hr(),
                         
                         h4("5. Confusion matrix",
                            style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                         p("Select the machine learning algorithm.",
                           style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                         # actionButton("btn_fit_cls", "Fit & show confusion matrices",
                                      # icon = icon("play"), class = "primary-button"),
                         tags$div(style = "height:10px;"),  # 闂磋窛
                         div(
                           id = "cls_cm_box_wrapper",
                           class = "plot-box",
                           uiOutput("cls_cm_box")
                           )
                         )
                     )
                 )
             ),
           
            # ---- 鏁版嵁涓婁紶 ----
           "cls_upload" = tagList(
             div(
               class = "card",
               h3("Numeric input(寰呮牴鎹疄闄呮儏鍐典慨鏀?",
                  style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
               p("You can input the product dimensions and buffer packaging plan.",
                 style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1;"),
               
               div(
                 class = "card",
                 div(
                   class = "grid",
                   # ---- 浜у搧淇℃伅杈撳叆 ----
                   div(
                     h4("Product information",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     # 瀹氫箟浜у搧鐨勯噸閲?
                     numericInput("Product_mass", "Product mass (kg)", value = 7.11, min = 0, step = 0.01, width = "70%"),
                     # 瀹氫箟浜у搧闀垮害杈撳叆鏂瑰紡
                     numericInput("Length_num", "Product length (cm)", value = 890, min = 0, step = 0.1, width = "70%"), 
                     # 瀹氫箟浜у搧瀹藉害杈撳叆鏂瑰紡
                     numericInput("Width_num", "Product width (cm)", value = 525, min = 0, step = 0.1, width = "70%"), 
                     # 瀹氫箟浜у搧楂樺害杈撳叆鏂瑰紡
                     numericInput("Height_num", "Product height (cm)", value = 75, min = 0, step = 0.1, width = "70%") 
                   ),
                   
                   # ---- 缂撳啿鍖呰鏂规杈撳叆 ----
                   div(
                     h4("Buffer packaging scheme",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     selectInput( "Buffer_material","Buffer material", choices = list("EPE" = "EPE", "EPP" = "EPP", "EPS" = "EPS"),selected = "EPE", width = "70%"),
                     numericInput("Buffer_density", "Buffer density (kg/m鲁)", value = 30, min = 0, step = 1, width = "70%"),
                     numericInput("Buffer_thickness", "Buffer thickness (cm)", value = 2,  min = 0, step = 0.1, width = "70%"),
                     numericInput("Buffer_mass", "Buffer mass (kg)", value = 0.5, min = 0, step = 0.1, width = "70%")
                   ),
                   # ---- 澶栧寘瑁呭寘瑁呮柟妗堣緭鍏?----
                   div(
                     h4("Outer packaging scheme",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     selectInput( "Packing_material","Packing material", choices = list("Corrugated paper" = "corrugated paper"),selected = "Corrugated paper", width = "70%"),
                     numericInput("Material_length", "Material length (cm)", value = 900, min = 0, step = 0.1, width = "70%"),
                     numericInput("Material_width", "Material width (cm)", value = 500,  min = 0, step = 0.1, width = "70%"),
                     numericInput("Material_height", "Material height (cm)", value = 600, min = 0, step = 0.1, width = "70%")
                   ),
                   
                   # ---- 褰撳墠杈撳叆棰勮 ----
                   div(
                     class = "grid--row2",
                     h4("Plan preview",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     DTOutput("tbl_numeric")
                   )
                 )
               ),
               
               # ---- 鏂囦欢涓婁紶 ----
               div(
                 # class = "card",
                 h3("File input",
                    style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                 p("You can also uplod the single or mupltiple data file (.csv/.xlsx), including product dimensions and buffer packaging plan.",
                   style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1;"),
                 
                 div(
                   class = "card",
                   # 娣诲姞鏂囦欢棰勮鍜屼笂浼犲姛鑳?
                   h4("File upload",
                      style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                   # 鏂板妯℃澘涓嬭浇鎸夐挳
                   p("Download the file template, fill and browse it.",
                     style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                   div(style = "display:flex; gap:10px; flex-wrap:wrap; margin:0.5px 0 50px 0;",
                       downloadButton("dl_template_unk_csv",  "Download .csv file template"),
                       uiOutput("btn_template_unk_xlsx")  # writexl 鍙敤鏃舵樉绀?
                   ),
                   fileInput("file_labeled_data", "Upload labeled data (.csv/.xlsx)", accept = c(".csv", ".xlsx"), buttonLabel = "Browse", placeholder = "Select labeled file..."),
                   fileInput("file_unknown", "Upload unknown data (.csv/.xlsx)", accept = c(".csv", ".xlsx"), buttonLabel = "Browse", placeholder = "Select unknown file..."),
                   div(class = "muted", "Labeled data powers evaluation; unknown rows feed the prediction tables."),
                   div(
                     # class = "card",
                     h4("Data preview",
                        style = "color:#590d82; font-weight:bold; margin-top:2px; margin-bottom:5px; line-height:0.5;"),
                     div(class = "muted", ""),
                     # 鍘熻〃鏍硷紙鍔犱簡妯悜婊氬姩瀹瑰櫒锛?
                     div(style = "max-width:100%; overflow-x:auto;",
                         DTOutput("tbl_file", width = "100%"))
                   )
                 )
                 
               )
             )
           ),
           "reg_upload" = tagList(
             # ---- 鏁板瓧杈撳叆 ----
             div(
               class = "card",
               h3("Numeric input(寰呮牴鎹疄闄呮儏鍐典慨鏀?",
                  style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
               p("You can input the product dimensions and buffer packaging plan.",
                 style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1;"),
               
               div(
                 class = "card",
                 div(
                   class = "grid",
                   # ---- 浜у搧淇℃伅杈撳叆 ----
                   div(
                     h4("Product information",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     # 瀹氫箟浜у搧鐨勯噸閲?
                     numericInput("Product_mass", "Product mass (kg)", value = 7.11, min = 0, step = 0.01, width = "70%"),
                     # 瀹氫箟浜у搧闀垮害杈撳叆鏂瑰紡
                     numericInput("Length_num", "Product length (cm)", value = 890, min = 0, step = 0.1, width = "70%"), 
                     # 瀹氫箟浜у搧瀹藉害杈撳叆鏂瑰紡
                     numericInput("Width_num", "Product width (cm)", value = 525, min = 0, step = 0.1, width = "70%"), 
                     # 瀹氫箟浜у搧楂樺害杈撳叆鏂瑰紡
                     numericInput("Height_num", "Product height (cm)", value = 75, min = 0, step = 0.1, width = "70%")
                   ),
                   
                   # ---- 缂撳啿鍖呰鏂规杈撳叆 ----
                   div(
                     h4("Buffer packaging scheme",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     selectInput( "Buffer_material","Buffer material", choices = list("EPE" = "EPE", "EPP" = "EPP", "EPS" = "EPS"),selected = "EPE", width = "70%"),
                     numericInput("Buffer_density", "Buffer density (kg/m鲁)", value = 30, min = 0, step = 1, width = "70%"),
                     numericInput("Buffer_thickness", "Buffer thickness (cm)", value = 2,  min = 0, step = 0.1, width = "70%"),
                     numericInput("Buffer_mass", "Buffer mass (kg)", value = 0.5, min = 0, step = 0.1, width = "70%")
                   ),
                   # ---- 澶栧寘瑁呭寘瑁呮柟妗堣緭鍏?----
                   div(
                     h4("Outer packaging scheme",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     selectInput( "Packing_material","Packing material", choices = list("Corrugated paper" = "corrugated paper"),selected = "Corrugated paper", width = "70%"),
                     numericInput("Material_length", "Material length (cm)", value = 900, min = 0, step = 0.1, width = "70%"),
                     numericInput("Material_width", "Material width (cm)", value = 500,  min = 0, step = 0.1, width = "70%"),
                     numericInput("Material_height", "Material height (cm)", value = 600, min = 0, step = 0.1, width = "70%")
                   ),
                   
                   # ---- 褰撳墠杈撳叆棰勮 ----
                   div(
                     class = "grid--row2",
                     h4("Plan preview",
                        style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:15px; line-height:0.5;"),
                     DTOutput("tbl_numeric")
                   )
                 )
               ),
               
               # ---- 鏂囦欢涓婁紶 ----
               div(
                 # class = "card",
                 h3("File input",
                    style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                 p("You can also uplod the single or mupltiple data file (.csv/.xlsx), including product dimensions and buffer packaging plan.",
                   style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:2px; line-height:1;"),
                 
                 div(
                   class = "card",
                   # 娣诲姞鏂囦欢棰勮鍜屼笂浼犲姛鑳?
                   h4("File upload",
                      style = "color:#590d82; font-weight:bold; margin-top:0px; margin-bottom:20px; line-height:1;"),
                   # 鏂板妯℃澘涓嬭浇鎸夐挳
                   p("Download the file template, fill and browse it.",
                     style = "text-indent:0ch; font-size:15px; font-family:'Arial'; font-weight:normal; color:#27296d; margin-top:0px; line-height:0.5;"),
                   div(style = "display:flex; gap:10px; flex-wrap:wrap; margin:0.5px 0 50px 0;",
                       downloadButton("dl_template_unk_csv",  "Download .csv file template"),
                       uiOutput("btn_template_unk_xlsx")  # writexl 鍙敤鏃舵樉绀?
                   ),
                   fileInput("file_lbl", "Upload labeled data (.csv/.xlsx)", accept = c(".csv", ".xlsx"), buttonLabel = "Browse", placeholder = "Select labeled file..."),
                   fileInput("file_unknown", "Upload unknown data (.csv/.xlsx)", accept = c(".csv", ".xlsx"), buttonLabel = "Browse", placeholder = "Select unknown file..."),
                   div(class = "muted", "Labeled data powers evaluation; unknown rows feed the prediction tables."),
                   div(
                     # class = "card",
                     h4("Data preview",
                        style = "color:#590d82; font-weight:bold; margin-top:2px; margin-bottom:5px; line-height:0.5;"),
                     div(class = "muted", ""),
                     # 鍘熻〃鏍硷紙鍔犱簡妯悜婊氬姩瀹瑰櫒锛?
                     div(style = "max-width:100%; overflow-x:auto;",
                         DTOutput("tbl_file", width = "100%"))
                   )
                 )
                 
               )
             )
           )
    )
  })
  
  # ---- 浜у搧/缂撳啿琛灚鏁版嵁杈撳叆鑱斿姩鍔熻兘 ----
  # 宸ュ叿鍑芥暟锛氭粦鍧椻啍鏁板瓧 鍙屽悜鑱斿姩锛堥伩鍏嶆寰幆)
  link_slider_num <- function(slider_id, num_id) {
    observeEvent(input[[slider_id]], {
      v <- input[[slider_id]]
      if (!identical(v, input[[num_id]]))
        updateNumericInput(session, num_id, value = v)
    }, ignoreInit = TRUE)
    
    observeEvent(input[[num_id]], {
      v <- input[[num_id]]
      if (!identical(v, input[[slider_id]]))
        updateSliderInput(session, slider_id, value = v)
    }, ignoreInit = TRUE)
  }
  
  # 缁戝畾涓夌粍鑱斿姩
  link_slider_num("Length_slider", "Length_num")
  link_slider_num("Width_slider",  "Width_num")
  link_slider_num("Height_slider", "Height_num")
  
  # 鍗曚釜鍖呰鏂规鍙傛暟棰勮琛?
  output$tbl_numeric <- DT::renderDT({
    product_dims <- c("Product mass (kg)" = input$Product_mass,
                      "Product length (cm)"  = input$Length_num,
                      "Product width (cm)"   = input$Width_num,
                      "Product hength (cm)"  = input$Height_num)
    packaging_plan <- c("Buffer material"   = input$Buffer_material,
                        "Buffer density (kg/m鲁)" = input$Buffer_density,
                        "Buffer thickness (cm)"  = input$Buffer_thickness)
    
    # 绠€鍗曚骇鍝佷綋绉绠?m鲁)
    product_volume <- round((as.numeric(input$Length_num) *as.numeric(input$Width_num) *as.numeric(input$Height_num)) / 1e6, 2)
    # 绠€鍗曠紦鍐叉潗鏂欒川閲忚绠楋紙kg)
    buffer_volume <- round((
      (as.numeric(input$Length_num) + 2*as.numeric(input$Buffer_thickness)) *
        (as.numeric(input$Width_num)  + 2*as.numeric(input$Buffer_thickness)) *
        (as.numeric(input$Height_num) + 2*as.numeric(input$Buffer_thickness))
    ) / 1e6 - product_volume, 2)
    # 璁＄畻缂撳啿鏉愭枡璐ㄩ噺锛坘g锛?
    buffer_mass <- round(buffer_volume * as.numeric(input$Buffer_density), 2)
    
    # 鍒涘缓棰勮鏁版嵁妗?
    df <- data.frame(
      Item   = c(names(product_dims), "Product volume (m鲁)", names(packaging_plan),"Buffer volume (m鲁)","Buffer mass (kg)"),
      Value  = c(unname(product_dims), product_volume, unname(packaging_plan), buffer_volume, buffer_mass),
      check.names = FALSE)
    df_wide <- tidyr::pivot_wider(df, names_from = Item, values_from = Value)
    DT::datatable(df_wide, options = list(dom = "t"))
    
  })
  
  # 澶氫釜鍖呰鏂规鏂囦欢棰勮琛?
  output$tbl_file <- DT::renderDT({
    d <- req(df_labeled())
    DT::datatable(
      head(d, 10),
      rownames = FALSE,
      options = list(
        pageLength = 10,
        dom = "tip",
        scrollX = TRUE,      # 鈫?寮€鍚í鍚戞粴鍔?
        autoWidth = TRUE
      )
    )
  })
  
  # 鏈煡鏍峰搧鏂囦欢妯℃澘鐢熸垚鍑芥暟
  make_template_unknown <- function() {
    tibble::tibble(
      ID          = c("S001", "S002", "S003"),
      M_Length    = c(20, 22, 25),
      M_Width     = c(15, 16, 18),
      M_Height    = c(5,  6,  7),
      L_Category  = c("EPE", "EPP", "EPS"),   # 浣犵殑浠ｇ爜閲屽彧鏄犲皠杩欎笁绫?
      L_Density   = c(25, 30, 35),            # kg/m鲁锛堢ず渚嬶級
      L_Thickness = c(1.5, 2.0, 2.5),         # cm锛堢ず渚嬶級
      P_Length    = c(40, 40, 40),
      P_Width     = c(30, 30, 30),
      P_Height    = c(10, 10, 10)
    )
  }
  
  # CSV 涓嬭浇 
  output$dl_template_unk_csv <- downloadHandler(
    filename = function() "bufferpack_template_unknown.csv",
    content  = function(file) utils::write.csv(make_template_unknown(), file, row.names = FALSE, na = "")
  )
  
  # XLSX 涓嬭浇锛堝彲閫夛紝writexl 鍙敤鎵嶆樉绀烘寜閽?瀵煎嚭锛?
  output$btn_template_unk_xlsx <- renderUI({
    if (requireNamespace("writexl", quietly = TRUE)) {
      downloadButton("dl_template_unk_xlsx", "Download .xlsx file template")
    } else {
      NULL
    }
  })
  if (requireNamespace("writexl", quietly = TRUE)) {
    output$dl_template_unk_xlsx <- downloadHandler(
      filename = function() "bufferpack_template_unknown.xlsx",
      content  = function(file) writexl::write_xlsx(make_template_unknown(), path = file)
    )
  }
  
  
  # ----棰勮锛氭贩娣嗙煩闃靛浘鐗?----
  output$cm_img_view <- renderImage({
    req(input$cm_img)
    list(
      src = input$cm_img$datapath,
      contentType = input$cm_img$type  # 娴忚鍣ㄤ細鐢ㄦ纭殑 MIME 鏄剧ず锛堝惈 svg/webp 绛夛級
    )
  }, deleteFile = FALSE)
  
  # 棰勮锛氬洖褰掓洸绾垮浘鐗?
  output$reg_img_view <- renderImage({
    req(input$reg_img)
    list(
      src = input$reg_img$datapath,
      contentType = input$reg_img$type
    )
  }, deleteFile = FALSE)
  
  # Data 椤甸潰锛氬畬鏁磋〃鏍?
  output$tbl_full <- renderDT({ datatable(df_labeled(), options = list(scrollX = TRUE, pageLength = 10)) })
  
  # ---------------- 妯″瀷杞藉叆涓庤瘎浼?----------------
  cls_model <- reactiveVal(NULL)
  reg_model <- reactiveVal(NULL)
  
  observeEvent(input$cls_prediction_model, {
    alg <- input$cls_prediction_model
    if (is.null(alg) || !alg %in% names(cls_model_paths)) {
      cls_model(NULL)
    } else {
      cls_model(load_cached_model(cls_model_paths[[alg]]))
    }
  }, ignoreNULL = FALSE)
  
  observeEvent(input$reg_prediction_model, {
    alg <- input$reg_prediction_model
    if (is.null(alg) || !alg %in% names(reg_model_paths)) {
      reg_model(NULL)
    } else {
      reg_model(load_cached_model(reg_model_paths[[alg]]))
    }
  }, ignoreNULL = FALSE)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  observeEvent(input$eval_cls, {
    d   <- req(df_labeled())
    mdl <- req(cls_model())
    
    # 棰勬祴绫诲埆锛堝繀椤诲惈 .pred_class锛?
    p_class <- tryCatch(predict(mdl, d), error = function(e) NULL)
    validate(need(!is.null(p_class) && ".pred_class" %in% names(p_class), "Model must output .pred_class for classification."))
    
    res <- bind_cols(d, p_class) %>% mutate(
      .pred_class = factor(.pred_class, levels = levels(d$class)),
      class       = factor(class,       levels = levels(d$class))
    )
    
    # 娣锋穯鐭╅樀
    output$plt_cm <- renderPlot({
      cm <- conf_mat(res, truth = class, estimate = .pred_class)
      autoplot(cm, type = "heatmap") + scale_fill_gradient(low = "#d7ecfb", high = "#9D71E3") + theme_minimal()
    })
    
    # ROC 鏇茬嚎锛堥槼鎬х被 = Unqualified锛?
    output$plt_roc <- renderPlot({
      probs <- tryCatch(predict(mdl, d, type = "prob"), error = function(e) NULL)
      validate(need(!is.null(probs), "No probability output available for ROC."))
      prob_cols <- grep("^\\.pred_", names(probs), value = TRUE)
      pos <- if (".pred_Unqualified" %in% prob_cols) ".pred_Unqualified" else prob_cols[1]
      est <- probs[[pos]]
      truth <- factor(d$class, levels = c("Qualified", "Unqualified"))
      roc_df <- yardstick::roc_curve_vec(truth = truth, estimate = est, event_level = "second")
      ggplot(roc_df, aes(x = 1 - specificity, y = sensitivity)) +
        geom_line(color = "#7C63F6", size = 1.1) +
        geom_abline(linetype = 2, color = "#cccccc") +
        coord_equal() + theme_minimal() + labs(x = "False Positive Rate", y = "True Positive Rate")
    })
    
    # 鎸囨爣琛紙Accuracy, Sensitivity, Specificity, F1, ROC AUC锛?
    output$tbl_cls_metrics <- renderDT({
      # 鍩烘湰鍒嗙被鎸囨爣
      met_fun <- yardstick::metric_set(accuracy, sens, spec, f_meas)
      base_metrics <- met_fun(res, truth = class, estimate = .pred_class)
      
      # AUC锛堜娇鐢ㄤ笌涓婇潰鐩稿悓鐨勬鐜囧垪/闃虫€ф按骞筹級
      probs <- tryCatch(predict(mdl, d, type = "prob"), error = function(e) NULL)
      auc_val <- NA_real_
      if (!is.null(probs)) {
        pos <- if (".pred_Unqualified" %in% names(probs)) ".pred_Unqualified" else names(probs)[1]
        auc_val <- yardstick::roc_auc_vec(
          truth = factor(d$class, levels = c("Qualified", "Unqualified")),
          estimate = probs[[pos]],
          event_level = "second"
        )
      }
      out <- base_metrics %>% select(.metric, .estimate) %>% mutate(.metric = toupper(.metric))
      out <- bind_rows(out, tibble(.metric = "ROC_AUC", .estimate = auc_val))
      datatable(out, rownames = FALSE, options = list(dom = "t"), colnames = c("Metric", "Estimate"))
    })
  })
  
  # -------- 鍥炲綊璇勪及锛氭暎鐐?娈嬪樊/鎸囨爣琛?--------
  observeEvent(input$eval_reg, {
    d   <- req(df_labeled())
    mdl <- req(reg_model())
    
    pred <- tryCatch(predict(mdl, d), error = function(e) NULL)
    validate(need(!is.null(pred) && ".pred" %in% names(pred), "Model must output .pred for regression."))
    res <- bind_cols(d, pred)
    
    output$plt_reg <- renderPlot({
      ggplot(res, aes(x = Accelerated_speed, y = .pred)) +
        geom_point(color = "#7C63F6", alpha = .7) +
        geom_smooth(method = lm, color = "#9D71E3", se = TRUE) +
        theme_minimal() + labs(x = "Actual", y = "Predicted")
    })
    
    output$plt_resid <- renderPlot({
      res$res <- res$.pred - res$Accelerated_speed
      ggplot(res, aes(res)) + geom_histogram(bins = 30, fill = "#7C63F6", color = "white") +
        theme_minimal() + labs(x = "Residual", y = "Count")
    })
    
    output$tbl_reg_metrics <- renderDT({
      met_fun <- yardstick::metric_set(rmse, mae, rsq)
      out <- met_fun(res, truth = Accelerated_speed, estimate = .pred) %>% select(.metric, .estimate) %>% mutate(.metric = toupper(.metric))
      datatable(out, rownames = FALSE, options = list(dom = "t"), colnames = c("Metric", "Estimate"))
    })
  })
  
  # ---------------- 鏈煡鏁版嵁棰勬祴琛?+ 涓嬭浇 ----------------
  pred_cls_tbl <- reactive({
    req(df_unknown(), cls_model())
    probs <- tryCatch(predict(cls_model(), df_unknown(), type = "prob"), error = function(e) NULL)
    pcls  <- tryCatch(predict(cls_model(), df_unknown()),          error = function(e) NULL)
    validate(need(!is.null(pcls), "Unable to predict with the classification model."))
    out <- bind_cols(df_unknown(), pcls, probs)
    if (".pred_class" %in% names(out)) names(out)[names(out) == ".pred_class"] <- "Predicted_class"
    out
  })
  
  pred_reg_tbl <- reactive({
    req(df_unknown(), reg_model())
    pred <- tryCatch(predict(reg_model(), df_unknown()), error = function(e) NULL)
    validate(need(!is.null(pred), "Unable to predict with the regression model."))
    out <- bind_cols(df_unknown(), pred)
    if (".pred" %in% names(out)) names(out)[names(out) == ".pred"] <- "Predicted_speed"
    out
  })
  
  output$tbl_pred_cls <- renderDT({ datatable(pred_cls_tbl(), options = list(scrollX = TRUE, pageLength = 10)) })
  output$tbl_pred_reg <- renderDT({ datatable(pred_reg_tbl(), options = list(scrollX = TRUE, pageLength = 10)) })
  
  output$dl_pred_cls <- downloadHandler(
    filename = function() paste0("classification_predictions_", format(Sys.time(), "%Y%m%d-%H%M%S"), ".csv"),
    content  = function(file) { write.csv(pred_cls_tbl(), file, row.names = FALSE, na = "") }
  )
  output$dl_pred_reg <- downloadHandler(
    filename = function() paste0("regression_predictions_", format(Sys.time(), "%Y%m%d-%H%M%S"), ".csv"),
    content  = function(file) { write.csv(pred_reg_tbl(), file, row.names = FALSE, na = "") }
  )
}

# 鍚姩搴旂敤
shinyApp(ui, server)


