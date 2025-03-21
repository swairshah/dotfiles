-- NvimTree shortcuts
vim.keymap.set('n', '<leader>nt', ':NvimTreeToggle<CR>', { silent = true, desc = "Toggle NvimTree" })

-- Use Ctrl+, to toggle focus between NvimTree and editor
vim.keymap.set('n', '<C-,>', function()
  local nvim_tree_wins = {}
  local editor_wins = {}
  local current_win = vim.api.nvim_get_current_win()
  
  -- Find NvimTree and editor windows
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    local buf_name = vim.api.nvim_buf_get_name(buf)
    if string.match(buf_name, "NvimTree") then
      table.insert(nvim_tree_wins, win)
    else
      table.insert(editor_wins, win)
    end
  end
  
  -- If NvimTree is not visible, open it
  if #nvim_tree_wins == 0 then
    vim.cmd('NvimTreeToggle')
    return
  end
  
  -- If we're in NvimTree, focus the editor window
  if vim.tbl_contains(nvim_tree_wins, current_win) and #editor_wins > 0 then
    vim.api.nvim_set_current_win(editor_wins[1])
  -- If we're in editor, focus the NvimTree window
  elseif #nvim_tree_wins > 0 then
    vim.api.nvim_set_current_win(nvim_tree_wins[1])
  end
end, { silent = true, desc = "Toggle focus between NvimTree and editor" })

require('nvim-tree').setup({
  on_attach = function(bufnr)
    local api = require('nvim-tree.api')

    local function opts(desc)
      return { desc = 'nvim-tree: ' .. desc, buffer = bufnr, noremap = true, silent = true, nowait = true }
    end

    -- Default mappings
    api.config.mappings.default_on_attach(bufnr)

    -- Custom mappings
    vim.keymap.set('n', 'u', api.tree.change_root_to_parent, opts('Up'))
    vim.keymap.set('n', 't', api.node.open.tab, opts('Open: New Tab'))
    vim.keymap.set('n', 's', api.node.open.vertical, opts('Open: Vertical Split'))
  end,
})


