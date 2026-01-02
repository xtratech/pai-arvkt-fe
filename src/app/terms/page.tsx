import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <Breadcrumb pageName="Terms and Conditions" />

      <div className="rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-dark dark:text-white">Terms and Conditions</h1>
            <p className="mt-2 text-sm text-dark-5 dark:text-dark-6">
              Last updated: January 2, 2026
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">
              1. Acceptance of the Terms
            </h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              By accessing or using this service, you agree to these Terms and Conditions. If you
              do not agree, do not use the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">2. Accounts and Access</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              You are responsible for maintaining the confidentiality of your account and for all
              activity that occurs under your credentials. You must notify us immediately of any
              unauthorized use.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">3. Acceptable Use</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              You agree not to misuse the service. This includes attempting to gain unauthorized
              access, disrupting the service, or using it for unlawful activities. Prohibited use
              includes [Optional: mention specific misuses like scraping or AI model extraction].
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">
              4. Fees, Payment, and VAT
            </h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              All fees are non-refundable unless otherwise stated. Prices are [exclusive/inclusive]
              of UAE VAT. By subscribing, you authorize us to charge your provided payment method
              via Stripe on a recurring basis. You may cancel at any time through your account
              settings; access will continue until the end of the current billing period.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">5. Intellectual Property</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              The Service, including its original content, code, features, and functionality, are
              owned by Pluree AI LTD (Reg. No.: 26677) and are protected by international copyright,
              trademark, and other intellectual property laws.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">
              6. Data Protection and Privacy
            </h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              We process your personal data in accordance with our Privacy Policy and the UAE
              Personal Data Protection Law (Federal Decree-Law No. 45 of 2021). You retain ownership
              of your content, but grant us a license to process it solely to provide the Service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">7. Third-Party Services</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              The service integrates with third-party providers (e.g., Stripe, OpenAI). Their terms
              and policies apply and are not controlled by us. We are not responsible for their
              service availability.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">
              8. Limitation of Liability and Indemnification
            </h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              To the maximum extent permitted by UAE law, Pluree AI LTD shall not be liable for any
              indirect, incidental, or consequential damages (including loss of profits or data).
              You agree to indemnify us against any claims arising from your breach of these terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">9. Governing Law</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              These Terms shall be governed by the laws of the United Arab Emirates, as applied in
              the Emirate of Abu Dhabi [or ADGM, if applicable]. Any disputes shall be subject to
              the exclusive jurisdiction of the courts of Abu Dhabi.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-dark dark:text-white">10. Changes to These Terms</h2>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              We may update these terms from time to time. Continued use of the service after
              changes take effect constitutes your acceptance of the revised terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
