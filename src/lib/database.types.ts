export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          changed_fields: string[]
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          merchant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          merchant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_fields?: string[]
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          merchant_id?: string | null
        }
        Relationships: []
      }
      invitation_acceptance_commands: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          merchant_slug: string | null
          token: string | null
        }
        Insert: {
          actor_id?: string
          created_at?: string
          id?: string
          merchant_slug?: string | null
          token?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          merchant_slug?: string | null
          token?: string | null
        }
        Relationships: []
      }
      invitation_creation_commands: {
        Row: {
          actor_id: string
          created_at: string
          email: string
          id: string
          invitation_id: string | null
          merchant_id: string
          merchant_name: string | null
          role: Database["public"]["Enums"]["member_role"]
          store_ids: string[]
          store_names: string[]
          token_hash: string | null
        }
        Insert: {
          actor_id?: string
          created_at?: string
          email: string
          id?: string
          invitation_id?: string | null
          merchant_id: string
          merchant_name?: string | null
          role: Database["public"]["Enums"]["member_role"]
          store_ids?: string[]
          store_names?: string[]
          token_hash?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          email?: string
          id?: string
          invitation_id?: string | null
          merchant_id?: string
          merchant_name?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          store_ids?: string[]
          store_names?: string[]
          token_hash?: string | null
        }
        Relationships: []
      }
      invitation_preview_commands: {
        Row: {
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          token: string | null
        }
        Insert: {
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          token?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          token?: string | null
        }
        Relationships: []
      }
      member_change_commands: {
        Row: {
          active: boolean
          actor_id: string
          created_at: string
          id: string
          membership_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          active: boolean
          actor_id?: string
          created_at?: string
          id?: string
          membership_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          active?: boolean
          actor_id?: string
          created_at?: string
          id?: string
          membership_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: []
      }
      member_store_commands: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          membership_id: string
          store_ids: string[]
        }
        Insert: {
          actor_id?: string
          created_at?: string
          id?: string
          membership_id: string
          store_ids?: string[]
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          membership_id?: string
          store_ids?: string[]
        }
        Relationships: []
      }
      merchant_application_commands: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          merchant_id: string | null
          name: string
          slug: string
        }
        Insert: {
          actor_id?: string
          created_at?: string
          id?: string
          merchant_id?: string | null
          name: string
          slug: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          merchant_id?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      merchant_invitation_stores: {
        Row: {
          invitation_id: string
          merchant_id: string
          store_id: string
        }
        Insert: {
          invitation_id: string
          merchant_id: string
          store_id: string
        }
        Update: {
          invitation_id?: string
          merchant_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_invitation_stores_merchant_id_invitation_id_fkey"
            columns: ["merchant_id", "invitation_id"]
            isOneToOne: false
            referencedRelation: "merchant_invitations"
            referencedColumns: ["merchant_id", "id"]
          },
          {
            foreignKeyName: "merchant_invitation_stores_merchant_id_store_id_fkey"
            columns: ["merchant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      merchant_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          delivery_state: string
          email: string
          expires_at: string
          id: string
          merchant_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          delivery_state?: string
          email: string
          expires_at?: string
          id?: string
          merchant_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          delivery_state?: string
          email?: string
          expires_at?: string
          id?: string
          merchant_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_invitations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_memberships: {
        Row: {
          active: boolean
          email: string
          id: string
          merchant_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          email: string
          id?: string
          merchant_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          email?: string
          id?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_memberships_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_store_assignments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          membership_id: string
          merchant_id: string
          store_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          membership_id: string
          merchant_id: string
          store_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          membership_id?: string
          merchant_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_store_assignments_merchant_id_membership_id_fkey"
            columns: ["merchant_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "merchant_memberships"
            referencedColumns: ["merchant_id", "id"]
          },
          {
            foreignKeyName: "merchant_store_assignments_merchant_id_store_id_fkey"
            columns: ["merchant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      merchants: {
        Row: {
          applicant_email: string | null
          applicant_id: string | null
          created_at: string
          id: string
          name: string
          rejection_reason: string | null
          slug: string
          status: Database["public"]["Enums"]["merchant_status"]
          updated_at: string
        }
        Insert: {
          applicant_email?: string | null
          applicant_id?: string | null
          created_at?: string
          id?: string
          name: string
          rejection_reason?: string | null
          slug: string
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
        }
        Update: {
          applicant_email?: string | null
          applicant_id?: string | null
          created_at?: string
          id?: string
          name?: string
          rejection_reason?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      order_groups: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          request_hash: string
          submitted_total_minor: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key: string
          request_hash: string
          submitted_total_minor: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          request_hash?: string
          submitted_total_minor?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          line_total_minor: number | null
          merchant_id: string
          product_id: string
          product_name: string
          quantity: number
          store_id: string
          store_order_id: string
          unit_price_minor: number
        }
        Insert: {
          id?: string
          line_total_minor?: number | null
          merchant_id: string
          product_id: string
          product_name: string
          quantity: number
          store_id: string
          store_order_id: string
          unit_price_minor: number
        }
        Update: {
          id?: string
          line_total_minor?: number | null
          merchant_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          store_id?: string
          store_order_id?: string
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_merchant_id_store_id_product_id_fkey"
            columns: ["merchant_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["merchant_id", "store_id", "id"]
          },
          {
            foreignKeyName: "order_items_store_order_id_merchant_id_store_id_fkey"
            columns: ["store_order_id", "merchant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id", "merchant_id", "store_id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_status"]
          previous_status: Database["public"]["Enums"]["order_status"] | null
          reason: string | null
          store_order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_status"]
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          reason?: string | null
          store_order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_status"]
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          reason?: string | null
          store_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_store_order_id_fkey"
            columns: ["store_order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_submission_commands: {
        Row: {
          actor_id: string
          created_at: string
          delivery: Json | null
          group_id: string | null
          id: string
          idempotency_key: string
          items: Json | null
        }
        Insert: {
          actor_id?: string
          created_at?: string
          delivery?: Json | null
          group_id?: string | null
          id?: string
          idempotency_key: string
          items?: Json | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          delivery?: Json | null
          group_id?: string | null
          id?: string
          idempotency_key?: string
          items?: Json | null
        }
        Relationships: []
      }
      order_transition_commands: {
        Row: {
          actor_id: string
          created_at: string
          expected_version: number
          id: string
          reason: string | null
          requested_status: Database["public"]["Enums"]["order_status"]
          result_version: number | null
          store_order_id: string
        }
        Insert: {
          actor_id?: string
          created_at?: string
          expected_version: number
          id?: string
          reason?: string | null
          requested_status: Database["public"]["Enums"]["order_status"]
          result_version?: number | null
          store_order_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          expected_version?: number
          id?: string
          reason?: string | null
          requested_status?: Database["public"]["Enums"]["order_status"]
          result_version?: number | null
          store_order_id?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          active: boolean
          user_id: string
        }
        Insert: {
          active?: boolean
          user_id: string
        }
        Update: {
          active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          archived_at: string | null
          available: boolean
          created_at: string
          description: string
          id: string
          merchant_id: string
          name: string
          price_minor: number
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          available?: boolean
          created_at?: string
          description?: string
          id?: string
          merchant_id: string
          name: string
          price_minor: number
          store_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          available?: boolean
          created_at?: string
          description?: string
          id?: string
          merchant_id?: string
          name?: string
          price_minor?: number
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_merchant_id_store_id_fkey"
            columns: ["merchant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string
          locale: string
          theme: string
          user_id: string
        }
        Insert: {
          display_name?: string
          locale?: string
          theme?: string
          user_id: string
        }
        Update: {
          display_name?: string
          locale?: string
          theme?: string
          user_id?: string
        }
        Relationships: []
      }
      store_orders: {
        Row: {
          created_at: string
          customer_id: string
          delivery: Json
          group_id: string
          id: string
          merchant_id: string
          reference: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          store_name: string
          subtotal_minor: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery: Json
          group_id: string
          id?: string
          merchant_id: string
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          store_name: string
          subtotal_minor: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery?: Json
          group_id?: string
          id?: string
          merchant_id?: string
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          store_name?: string
          subtotal_minor?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_group_id_customer_id_fkey"
            columns: ["group_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id", "customer_id"]
          },
          {
            foreignKeyName: "store_orders_merchant_id_store_id_fkey"
            columns: ["merchant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["merchant_id", "id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          city: string
          created_at: string
          id: string
          merchant_id: string
          name: string
          phone: string
          state: string
          street: string
          timezone: string
          updated_at: string
          version: number
          zip_code: string
        }
        Insert: {
          active?: boolean
          city: string
          created_at?: string
          id?: string
          merchant_id: string
          name: string
          phone: string
          state: string
          street: string
          timezone?: string
          updated_at?: string
          version?: number
          zip_code: string
        }
        Update: {
          active?: boolean
          city?: string
          created_at?: string
          id?: string
          merchant_id?: string
          name?: string
          phone?: string
          state?: string
          street?: string
          timezone?: string
          updated_at?: string
          version?: number
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_flags: {
        Row: {
          has_membership: boolean | null
          platform: boolean | null
          user_id: string | null
        }
        Relationships: []
      }
      catalog_products: {
        Row: {
          available: boolean | null
          description: string | null
          id: string | null
          merchant_slug: string | null
          name: string | null
          price_minor: number | null
          store_id: string | null
          store_name: string | null
        }
        Relationships: []
      }
      catalog_stores: {
        Row: {
          city: string | null
          id: string | null
          merchant_name: string | null
          merchant_slug: string | null
          name: string | null
          phone: string | null
          search_text: string | null
          state: string | null
          street: string | null
          timezone: string | null
          zip_code: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      member_role: "admin" | "staff" | "operator"
      merchant_status: "pending" | "active" | "rejected" | "suspended"
      order_status:
        | "placed"
        | "accepted"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "rejected"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      member_role: ["admin", "staff", "operator"],
      merchant_status: ["pending", "active", "rejected", "suspended"],
      order_status: [
        "placed",
        "accepted",
        "preparing",
        "out_for_delivery",
        "delivered",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const

