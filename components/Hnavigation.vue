<script setup>
let linksHub = (ref < Map) | (null > null);
const AuthH = ref(false);

const token = useCookie("authToken").value;
console.log(`token : ${token}`);

linksHub = ref([
  [
    {
      Num: "0",
      label: "Accueil",
      icon: "i-heroicons-home",
      to: "/",
    },
    {
      Num: "0",
      label: "Spécificités",
      icon: "i-heroicons-command-line",
      to: "/Specs",
    },
    {
      Num: "0",
      label: "Produits",
      icon: "i-heroicons-command-line",
      to: "/Products",
    },
  ],
  [
    {
      label: "",
      Num: "1",
    },

    token
      ? {
        label: "Dashboard",
        to: "/dashboard",
      }
      : {
        label: "Se connecter",
        click: () => {
          AuthH.value = true;
        },
      },
  ],
]);
</script>

<template>
  <div>
    <UHorizontalNavigation :links="linksHub" class="border-b border-gray-200 dark:border-gray-800">
      <template #default="{ link }">
        <colorMod v-if="link.Num == 1" />
        <span class="group-hover:text-primary relative">{{ link.label }}</span>
      </template>
    </UHorizontalNavigation>
    <UModal v-model="AuthH">
      <auth />
    </UModal>
  </div>
</template>
