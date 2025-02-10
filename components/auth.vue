<script setup lang="ts">
import AuthH from "./Hnavigation.vue";
const { auth } = useRuntimeConfig();
const emit = defineEmits(["onLogin", "onRegister", "onError"]);
const usernameError = ref<string | null>(null);
const toast = useToast();
let cookie = ref<null | string>(null);

const tabs = [
  {
    label: "Log In",
    slot: "login",
  },
  {
    label: "Register",
    slot: "register",
  },
];

const hidden = ref(true);

interface loginFormModel {
  email: string;
  password: string;
}
const loginForm = ref<loginFormModel>({
  email: "",
  password: "",
});

interface registerFormModel {
  email: string;
  username: string;
  password: string;
}
const registerForm = ref<registerFormModel>({
  email: "",
  username: "",
  password: "",
});

function onLogin(user: string) {
  AuthH.value = false;
  toast.add({
    title: "Logged In",
    icon: "i-ph-sign-in",
    description: `${user} logged in successfully.`,
  });
}

function onRegister(user: string) {
  AuthH.value = false;
  toast.add({
    title: "Registered",
    icon: "i-ph-sign-in",
    description: `${user} registered successfully.`,
  });
}

async function login() {
  try {
    const data = await $fetch("/api/auth/login", {
      method: "POST",
      body: loginForm.value,
      credentials: "include",
    });
    if (data.loggedIn) {
      useCookie("authToken").value = data.token
      navigateTo("/dashboard");
      onLogin(loginForm.value.email);
    }
  } catch (error: any) {
    emit("onError", error);
  }
}

const validateUsername = () => {
  // Expression régulière pour permettre uniquement les lettres et les chiffres
  const pattern = /^[a-zA-Z0-9_]*$/;
  if (!registerForm.value.username) {
    usernameError.value = "Username is required";
  } else if (registerForm.value.username.length < 3) {
    usernameError.value = "3 caracter minimum";
  } else if (!pattern.test(registerForm.value.username)) {
    usernameError.value =
      "Username can only contain letters, numbers and underscore";
  } else {
    usernameError.value = null;
  }
};

async function register() {
  validateUsername();
  if (!usernameError.value) {
    console.log("Form submitted:", registerForm.value);
    try {
      const data = await $fetch("/api/auth/register", {
        method: "POST",
        body: registerForm.value,
      });
      if (data.registered) {
        console.log("emit");
        onRegister(registerForm.value.username);
      } else {
        console.log("not registered")
      }
    } catch (error: any) {
      console.log(error);
    }
  }
}
</script>
<template>
  <UTabs class="p-4" :items="tabs">
    <template #login="{ item }">
      <UCard>
        <template #header>
          <div class="flex">
            <UIcon class="w-12 h-12 mr-2 bg-primary" name="i-ph-user" />
            <div>
              <p class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                {{ item.label }}
              </p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Log in to your account.
              </p>
            </div>
          </div>
        </template>

        <UForm :state="loginForm">
          <UFormGroup label="Email or Password" name="email or Password" class="mb-3" required>
            <UInput v-model="loginForm.email" placeholder="user" icon="i-ph-envelope" />
          </UFormGroup>
          <UFormGroup label="Password" name="password" required>
            <UInput v-model="loginForm.password" placeholder="password" icon="i-ph-lock"
              :type="hidden ? 'password' : 'text'" :ui="{ icon: { trailing: { pointer: '' } } }">
              <template #trailing>
                <UButton :icon="hidden ? 'i-ph-eye-closed' : 'i-ph-eye'" variant="link" :padded="false"
                  @click="hidden = !hidden" />
              </template>
            </UInput>
          </UFormGroup>
        </UForm>

        <template #footer>
          <UButton class="w-full justify-center" @click="login">
            Log in
          </UButton>
        </template>
      </UCard>
    </template>
    <template #register="{ item }">
      <UCard @submit.prevent="register">
        <template #header>
          <div class="flex">
            <UIcon class="w-12 h-12 mr-2 bg-cyan-400" name="i-ph-user-plus" />
            <div>
              <p class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                {{ item.label }}
              </p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create an account
              </p>
            </div>
          </div>
        </template>

        <UFormGroup label="Email" name="email" class="mb-3" required>
          <UInput v-model="registerForm.email" placeholder="user@gmail.com" icon="i-ph-envelope" />
        </UFormGroup>
        <UFormGroup label="Username" name="username" class="mb-3" :class="{ 'is-invalid': usernameError }" required>
          <UInput v-model="registerForm.username" placeholder="Username" icon="i-ph-envelope" />
        </UFormGroup>
        <div v-if="usernameError" class="invalid-feedback">
          {{ usernameError }}
        </div>
        <UFormGroup label="Password" name="password" required>
          <UInput v-model="registerForm.password" placeholder="password" icon="i-ph-lock"
            :type="hidden ? 'password' : 'text'" :ui="{ icon: { trailing: { pointer: '' } } }">
            <template #trailing>
              <UButton :icon="hidden ? 'i-ph-eye-closed' : 'i-ph-eye'" variant="link" :padded="false"
                @click="hidden = !hidden" />
            </template>
          </UInput>
        </UFormGroup>

        <template #footer>
          <UButton class="w-full justify-center" type="submit" color="cyan">
            Register
          </UButton>
        </template>
      </UCard>
    </template>
  </UTabs>
</template>
