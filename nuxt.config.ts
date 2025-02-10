// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
  runtimeConfig: {
    aut: {
      mongoUri: "mongodb://192.168.1.33:27017/users" || "mongodb://192.168.1.33:27017/servers",
      mongoSecret:
        "6404f35f37147bca8b50c17e52425a70af0e4b4c7a47942046b305b07a2aac6a"
    },
  },
  compatibilityDate: "2024-04-03",
  modules: ["@nuxt/ui", "@nuxtjs/color-mode"],
  colorMode: {
    classSuffix: "", 
  },   
}); 
 
