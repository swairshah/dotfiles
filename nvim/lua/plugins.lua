return {
    {'nvim-telescope/telescope.nvim', tag = '0.1.8', 
      dependencies = { 'nvim-lua/plenary.nvim' },
    },
    {'nvim-treesitter/nvim-treesitter'}, 
    {'nvim-treesitter/playground'}, 
    {'tpope/vim-fugitive'},
    {'ziglang/zig.vim'},
    {'neovim/nvim-lspconfig'},
    {'hrsh7th/cmp-nvim-lsp'},
    {'hrsh7th/nvim-cmp'},
    {'Exafunction/codeium.vim'},
    {'williamboman/mason.nvim'},
    {'williamboman/mason-lspconfig.nvim'},
    {'navarasu/onedark.nvim'},
	{"nvim-tree/nvim-tree.lua", 
		version = "*", 
		lazy = false, 
		dependencies = {"nvim-tree/nvim-web-devicons",
		},
        config = function()
            require("nvim-tree").setup {}
        end,
    }
}
