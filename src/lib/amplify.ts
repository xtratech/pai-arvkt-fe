"use client";

import { Amplify } from "aws-amplify";

let configured = false;

export function configureAmplify() {
  if (configured) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: "ap-southeast-1_RKA2kwSIo",
        userPoolClientId: "1krbpsjcvncj2um0nhhm3fk4pb",
      },
    },
  });

  configured = true;
}
