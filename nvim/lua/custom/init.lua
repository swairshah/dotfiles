vim.g.mapleader = ","
vim.g.maplocalleader = "\\"

require("custom.lazy")

vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)
-- : -> ;
vim.keymap.set("n", ";", ":")
vim.cmd("set number")

require("onedark").setup({
	style = "warmer",
})
require("onedark").load()

-- nice tab switching:
vim.keymap.set("n", "<leader>1", "1gt")
vim.keymap.set("n", "<leader>2", "2gt")
-- go to next tab with ctrl+shift+k
vim.keymap.set("n", "<C-S-k>", ":tabnext<CR>")
-- go to previous tab with ctrl+shift+j
vim.keymap.set("n", "<C-S-j>", ":tabprevious<CR>")

-- Tab switching with Alt+j/k (with circular navigation)
vim.keymap.set("n", "<A-j>", function()
  if vim.fn.tabpagenr() == 1 then
    vim.cmd("tablast")
  else
    vim.cmd("tabprevious")
  end
end, { noremap = true, silent = true, desc = "Previous tab (circular)" })

vim.keymap.set("n", "<A-k>", function()
  if vim.fn.tabpagenr() == vim.fn.tabpagenr('$') then
    vim.cmd("tabfirst")
  else
    vim.cmd("tabnext")
  end
end, { noremap = true, silent = true, desc = "Next tab (circular)" })

vim.keymap.set("n", "<leader>zr", function()
	vim.cmd("write")
	local output = vim.fn.systemlist("zig build run")
	-- vim.cmd('split new')
	vim.cmd("botright 10new") -- Open a new window at the bottom with 10 lines height
	vim.api.nvim_buf_set_lines(0, 0, -1, false, output)
	vim.cmd("setlocal buftype=nofile")
	vim.cmd("setlocal bufhidden=hide")
	vim.cmd("setlocal noswapfile")
end, { noremap = true, silent = true, desc = "Run zig build run" })

-- execute python file
vim.keymap.set("n", "<leader>py", function()
	vim.cmd("write")
	local output = vim.fn.systemlist("python3 " .. vim.fn.expand("%"))
	-- vim.cmd('split new')
	vim.cmd("botright 10new") -- Open a new window at the bottom with 10 lines height
	vim.api.nvim_buf_set_lines(0, 0, -1, false, output)
	vim.cmd("setlocal buftype=nofile")
	vim.cmd("setlocal bufhidden=hide")
	vim.cmd("setlocal noswapfile")
end, { noremap = true, silent = true, desc = "Run python file" })

-- execute typesscript file 
vim.keymap.set("n", "<leader>ts", function()
	vim.cmd("write")
	local output = vim.fn.systemlist("bun run " .. vim.fn.expand("%"))
	-- vim.cmd('split new')
	vim.cmd("botright 10new") -- Open a new window at the bottom with 10 lines height
	vim.api.nvim_buf_set_lines(0, 0, -1, false, output)
	vim.cmd("setlocal buftype=nofile")
	vim.cmd("setlocal bufhidden=hide")
	vim.cmd("setlocal noswapfile")
end, { noremap = true, silent = true, desc = "Run typescript file" })

vim.cmd([[ 
augroup typescript_settings
    autocmd!
    autocmd FileType typescript setlocal expandtab shiftwidth=2 tabstop=2 autoindent smartindent
augroup END
]])