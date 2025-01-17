vim.g.mapleader = ","
vim.g.maplocalleader = "\\"

require("custom.lazy")

vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)
-- : -> ;
vim.keymap.set("n", ";", ":")

require('onedark').setup {
    style = 'warmer'
}
require('onedark').load();

-- nice tab switching:
vim.keymap.set("n", "<leader>1", "1gt")
vim.keymap.set("n", "<leader>2", "2gt")
-- go to next tab with ctrl+shift+k
vim.keymap.set("n", "<C-S-k>", ":tabnext<CR>")
-- go to previous tab with ctrl+shift+j
vim.keymap.set("n", "<C-S-j>", ":tabprevious<CR>")

vim.keymap.set('n', '<leader>zr', function()
    vim.cmd('write')
    local output = vim.fn.systemlist('zig build run')
    -- vim.cmd('split new')
    vim.cmd('botright 10new')  -- Open a new window at the bottom with 10 lines height
    vim.api.nvim_buf_set_lines(0, 0, -1, false, output)
    vim.cmd('setlocal buftype=nofile')
    vim.cmd('setlocal bufhidden=hide')
    vim.cmd('setlocal noswapfile')
end, { noremap = true, silent = true, desc = 'Run zig build run' })

-- execute python file
vim.keymap.set('n', '<leader>py', function()
    vim.cmd('write')
    local output = vim.fn.systemlist('python3 ' .. vim.fn.expand('%'))
    -- vim.cmd('split new')
    vim.cmd('botright 10new')  -- Open a new window at the bottom with 10 lines height
    vim.api.nvim_buf_set_lines(0, 0, -1, false, output)
    vim.cmd('setlocal buftype=nofile')
    vim.cmd('setlocal bufhidden=hide')
    vim.cmd('setlocal noswapfile')
end, { noremap = true, silent = true, desc = 'Run python file' })

