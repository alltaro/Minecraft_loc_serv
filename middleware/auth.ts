import { defineNuxtRouteMiddleware, useNuxtApp } from '#app'
import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(() => {
    const { loggedIn } = useAuth()
    const nuxtApp = useNuxtApp()

    watch(loggedIn, () => {
      if (!loggedIn.value)
        return navigateTo('/')
    })
  
    if (!loggedIn.value)
      return navigateTo('/')
  })