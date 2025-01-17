-- NvimTree shortcuts
vim.keymap.set('n', '<C-,>', ':NvimTreeToggle<CR>', { silent = true })

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


