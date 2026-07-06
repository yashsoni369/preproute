"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { ApiError, loginUser } from "@/lib/api"
import { setAuthSession } from "@/lib/auth"
import { prefetchDashboardTests } from "@/lib/dashboard-tests-client"
import { loginSchema, type LoginFormValues } from "@/lib/validation/login-schema"

export function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { userId: "", password: "" },
  })

  async function onSubmit(values: LoginFormValues) {
    try {
      const response = await loginUser({
        userId: values.userId.trim(),
        password: values.password,
      })

      if (!response.data?.token) {
        throw new Error("Login succeeded without a token")
      }

      setAuthSession(response.data.token, response.data.user)
      toast.success("Logged in", { description: "Welcome back." })
      router.prefetch("/dashboard")
      void prefetchDashboardTests()
      router.push("/test-creation")
    } catch (error) {
      const isUnauthorized = error instanceof ApiError && error.status === 401

      toast.error(
        isUnauthorized
          ? "Invalid User ID or password"
          : "Unable to login. Please check your connection and try again."
      )
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#f7fbff] text-[#374151]">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[49.3%_50.7%]">
        <section className="hidden items-center justify-center px-10 lg:flex">
          <Image
            src="/assets/login-illustration.png"
            alt="Desk illustration"
            width={500}
            height={370}
            priority
            className="mt-20 h-auto w-full max-w-[500px] object-contain"
          />
        </section>

        <section className="flex h-full items-center justify-center bg-white px-5 py-[19px] lg:bg-transparent lg:pr-5">
          <Card className="h-full min-h-0 w-full max-w-[710px] justify-center rounded-[6px] border border-[#60a5fa] bg-white px-6 py-12 shadow-none ring-0 sm:px-20 lg:px-[99px]">
            <form
              className="mx-auto flex w-full max-w-[510px] flex-col"
              onSubmit={handleSubmit(onSubmit)}
              noValidate
            >
              <Image
                src="/assets/preproute-logo.png"
                alt="Preproute"
                width={150}
                height={40}
                priority
                className="mb-8 h-auto w-[139px]"
              />

              <div className="mb-8">
                <h1 className="text-[22px] font-semibold leading-7 tracking-normal text-[#374151]">
                  Login
                </h1>
                <p className="mt-6 text-[13px] leading-5 text-[#374151]">
                  Use your company provided Login credentials
                </p>
              </div>

              <div className="space-y-8">
                <div className="space-y-[17px]">
                  <Label
                    htmlFor="userId"
                    className="text-[16px] font-medium leading-5 text-[#374151]"
                  >
                    User ID
                  </Label>
                  <Input
                    id="userId"
                    placeholder="Enter User ID"
                    autoComplete="username"
                    aria-invalid={Boolean(errors.userId)}
                    className="h-12 rounded-[6px] border-[#9ca3af] px-4 text-[15px] text-[#374151] shadow-none placeholder:text-[#c8ced8] focus-visible:border-[#6d8cff] focus-visible:ring-[#6d8cff]/20"
                    {...register("userId")}
                  />
                  {errors.userId ? (
                    <p className="text-sm text-red-500">{errors.userId.message}</p>
                  ) : null}
                </div>

                <div className="space-y-[17px]">
                  <Label
                    htmlFor="password"
                    className="text-[16px] font-medium leading-5 text-[#374151]"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      placeholder="Enter Password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={Boolean(errors.password)}
                      className="h-12 rounded-[6px] border-[#9ca3af] px-4 pr-12 text-[15px] text-[#374151] shadow-none placeholder:text-[#c8ced8] focus-visible:border-[#6d8cff] focus-visible:ring-[#6d8cff]/20"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#98a2b3] transition hover:text-[#30384b] focus-visible:outline-none focus-visible:text-[#6d8cff]"
                    >
                      {showPassword ? (
                        <EyeOff className="size-5" />
                      ) : (
                        <Eye className="size-5" />
                      )}
                    </button>
                  </div>
                  {errors.password ? (
                    <p className="text-sm text-red-500">{errors.password.message}</p>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  toast.info("Contact your administrator", {
                    description:
                      "Password resets are handled by your company admin.",
                  })
                }
                className="mt-8 w-fit text-[14px] font-medium leading-5 text-[#1b5def] transition hover:text-[#1547c0]"
              >
                Forgot password?
              </button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-8 h-12 rounded-[6px] bg-[#5988ef] text-[16px] font-medium text-white shadow-none hover:bg-[#4a78e0]"
              >
                {isSubmitting ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </main>
  )
}
