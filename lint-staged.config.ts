export default {
	"*.{js,jsx,ts,tsx,json,yml,yaml,css,graphql,html}": ["biome check --write --staged"],
	"*.{ts,tsx}": () => "tsgo -p tsconfig.json",
};
