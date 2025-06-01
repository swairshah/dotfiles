-- Reserve a space in the gutter
-- This will avoid an annoying layout shift in the screen
vim.opt.signcolumn = 'yes'

-- Add cmp_nvim_lsp capabilities settings to lspconfig
-- This should be executed before you configure any language server
local lspconfig_defaults = require('lspconfig').util.default_config
lspconfig_defaults.capabilities = vim.tbl_deep_extend(
  'force',
  lspconfig_defaults.capabilities,
  require('cmp_nvim_lsp').default_capabilities()
)

-- This is where you enable features that only work
-- if there is a language server active in the file
vim.api.nvim_create_autocmd('LspAttach', {
  desc = 'LSP actions',
  callback = function(event)
    local opts = {buffer = event.buf}

    vim.keymap.set('n', 'K', '<cmd>lua vim.lsp.buf.hover()<cr>', opts)
    vim.keymap.set('n', 'gd', '<cmd>lua vim.lsp.buf.definition()<cr>', opts)
    vim.keymap.set('n', 'gD', '<cmd>lua vim.lsp.buf.declaration()<cr>', opts)
    vim.keymap.set('n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<cr>', opts)
    vim.keymap.set('n', 'go', '<cmd>lua vim.lsp.buf.type_definition()<cr>', opts)
    vim.keymap.set('n', 'gr', '<cmd>lua vim.lsp.buf.references()<cr>', opts)
    vim.keymap.set('n', 'gs', '<cmd>lua vim.lsp.buf.signature_help()<cr>', opts)
    vim.keymap.set('n', '<F2>', '<cmd>lua vim.lsp.buf.rename()<cr>', opts)
    vim.keymap.set({'n', 'x'}, '<F3>', '<cmd>lua vim.lsp.buf.format({async = true})<cr>', opts)
    vim.keymap.set('n', '<F4>', '<cmd>lua vim.lsp.buf.code_action()<cr>', opts)
  end,
})

-- These are just examples. Replace them with the language
-- servers you have installed in your system
require('lspconfig').gopls.setup({
  on_attach = function(client, bufnr)
    -- Enable format on save for Go files
    if client.supports_method("textDocument/formatting") then
      vim.api.nvim_create_autocmd("BufWritePre", {
        buffer = bufnr,
        callback = function()
          vim.lsp.buf.format({ async = false })
        end,
      })
    end
  end,
})

-- Go-specific settings
vim.api.nvim_create_autocmd("FileType", {
  pattern = "go",
  callback = function()
    vim.opt_local.tabstop = 4
    vim.opt_local.shiftwidth = 4
    vim.opt_local.expandtab = false
    
    -- Go-specific keymaps
    local opts = { buffer = true, silent = true }
    vim.keymap.set('n', '<leader>gt', '<cmd>GoTest<cr>', opts)
    vim.keymap.set('n', '<leader>gT', '<cmd>GoTestFunc<cr>', opts)
    vim.keymap.set('n', '<leader>gr', '<cmd>GoRun<cr>', opts)
    vim.keymap.set('n', '<leader>gs', '<cmd>GoStop<cr>', opts)
    vim.keymap.set('n', '<leader>gb', '<cmd>GoBuild<cr>', opts)
    vim.keymap.set('n', '<leader>gi', '<cmd>GoImport<cr>', opts)
    vim.keymap.set('n', '<leader>gj', '<cmd>GoAddTag<cr>', opts)
    vim.keymap.set('n', '<leader>gc', '<cmd>GoCoverage<cr>', opts)
    vim.keymap.set('n', '<leader>gf', '<cmd>GoFillStruct<cr>', opts)
    vim.keymap.set('n', '<leader>ge', '<cmd>GoIfErr<cr>', opts)
  end,
})

-- DAP debugging keymaps
vim.keymap.set('n', '<leader>db', '<cmd>lua require"dap".toggle_breakpoint()<cr>')
vim.keymap.set('n', '<leader>dc', '<cmd>lua require"dap".continue()<cr>')
vim.keymap.set('n', '<leader>di', '<cmd>lua require"dap".step_into()<cr>')
vim.keymap.set('n', '<leader>do', '<cmd>lua require"dap".step_over()<cr>')
vim.keymap.set('n', '<leader>dO', '<cmd>lua require"dap".step_out()<cr>')
vim.keymap.set('n', '<leader>dr', '<cmd>lua require"dap".repl.toggle()<cr>')
vim.keymap.set('n', '<leader>dl', '<cmd>lua require"dap".run_last()<cr>')
vim.keymap.set('n', '<leader>du', '<cmd>lua require"dapui".toggle()<cr>')
vim.keymap.set('n', '<leader>dt', '<cmd>lua require"dap".terminate()<cr>')
require('lspconfig').rust_analyzer.setup({})
-- require('lspconfig').pylsp.setup({})

require('lspconfig').zls.setup {
  -- Server-specific settings. See `:help lspconfig-setup`

  -- omit the following line if `zls` is in your PATH
  cmd = { '/Users/shahswai/work/misc/zig-stuff/zls/zig-out/bin/zls' },
  -- There are two ways to set config options:
  --   - edit your `zls.json` that applies to any editor that uses ZLS
  --   - set in-editor config options with the `settings` field below.
  --
  -- Further information on how to configure ZLS:
  -- https://zigtools.org/zls/configure/
  settings = {
    zls = {
      -- Whether to enable build-on-save diagnostics
      --
      -- Further information about build-on save:
      -- https://zigtools.org/zls/guides/build-on-save/
      -- enable_build_on_save = true,

      -- omit the following line if `zig` is in your PATH
      -- zig_exe_path = '/path/to/zig_executable'
    }
  }
}

-- Setup TypeScript Language Server
-- require("lspconfig").tsserver.setup {
--   on_attach = function(client, bufnr)
--     -- Key mappings (adjust as needed)
--     local function buf_set_keymap(...) vim.api.nvim_buf_set_keymap(bufnr, ...) end
--     local opts = { noremap=true, silent=true }
-- 
--     -- Mappings.
--     buf_set_keymap('n', 'gd', '<cmd>lua vim.lsp.buf.definition()<CR>', opts)
--     buf_set_keymap('n', 'K', '<cmd>lua vim.lsp.buf.hover()<CR>', opts)
--     buf_set_keymap('n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<CR>', opts)
--     buf_set_keymap('n', '<leader>rn', '<cmd>lua vim.lsp.buf.rename()<CR>', opts)
--     buf_set_keymap('n', '<leader>ca', '<cmd>lua vim.lsp.buf.code_action()<CR>', opts)
-- 
--     -- Enable completion triggered by <c-x><c-o>
--     vim.api.nvim_buf_set_option(bufnr, 'omnifunc', 'v:lua.vim.lsp.omnifunc')
--   end,
-- }
