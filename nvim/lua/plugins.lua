return {
    {'nvim-telescope/telescope.nvim', tag = '0.1.8', 
      dependencies = { 'nvim-lua/plenary.nvim' },
    },
    {'nvim-treesitter/nvim-treesitter'}, 
    {'nvim-treesitter/playground'}, 
    {'tpope/vim-fugitive'},
    {'ziglang/zig.vim'},
    -- Go development
    {'ray-x/go.nvim',
        dependencies = {
            'ray-x/guihua.lua',
            'neovim/nvim-lspconfig',
            'nvim-treesitter/nvim-treesitter',
        },
        config = function()
            require('go').setup()
        end,
        event = {"CmdlineEnter"},
        ft = {"go", 'gomod'},
        build = ':lua require("go.install").update_all_sync()'
    },
    -- Debugging support
    {'mfussenegger/nvim-dap'},
    {'leoluz/nvim-dap-go',
        dependencies = {'mfussenegger/nvim-dap'},
        config = function()
            require('dap-go').setup()
        end,
        ft = "go"
    },
    {'rcarriga/nvim-dap-ui',
        dependencies = {'mfussenegger/nvim-dap', 'nvim-neotest/nvim-nio'},
        config = function()
            require("dapui").setup()
        end
    },
    {'neovim/nvim-lspconfig'},
    {'hrsh7th/cmp-nvim-lsp'},
    {'hrsh7th/nvim-cmp',
        dependencies = {
            'hrsh7th/cmp-buffer',        -- Buffer completions
            'hrsh7th/cmp-path',          -- Path completions
            'hrsh7th/cmp-cmdline',       -- Command line completions
            'saadparwaiz1/cmp_luasnip',  -- Snippet completions
            'L3MON4D3/LuaSnip',         -- Snippet engine
            'rafamadriz/friendly-snippets', -- Go snippets
        }
    },
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
