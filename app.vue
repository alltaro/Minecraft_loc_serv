<script setup lang="ts">
import type { H3Error } from 'h3'

const toast = useToast()
const router = useRouter()
const { modal } = useAuthModal()

const route = useRoute()


</script>

<template>
  <html>

  <Body>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </Body>
  <UNotifications />

  </html>
</template>

<style>
span[class^="i-"] {
  background-size: contain;
  background-position: center;
}
</style>