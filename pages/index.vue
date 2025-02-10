<script setup lang="ts">
const { loggedIn } = useAuth();
const isOpen = ref(false);
const toast = useToast();

definePageMeta({
  layout: "public",
});

function load() {
  toast.add({
    title: "Success!",
    description: "Notification.",
    icon: "i-ph-check",
  });
}
</script>

<template>
  <div>
    <UButton label="Open" @click="load()" />
    <h1>coucou</h1>
  </div>
</template>
