<script setup lang="ts">
const route = useRoute();
const links = [
  [
    {
      label: "Tableau de Bord",
      icon: "i-heroicons-home",
      to: "/dashboard",
    },
    {
      label: "Vertical Navigation",
      icon: "i-heroicons-chart-bar",
      to: "/dashboard/Shop",
    },
    {
      label: "Vertical Navigation",
      icon: "dashicons:database-add",
      to: "/dashboard/createserver",
    },
    {
      label: "Vertical Navigation",
      icon: "dashicons:database-view",
      to: "/dashboard/listserver",
    },
  ],
];
</script>

<template>
  <UVerticalNavigation :links="links" />
</template>
