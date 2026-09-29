export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          submission_id: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          submission_id?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          submission_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          from_address: string
          id: string
          status: string
          subject: string
          submission_id: string | null
          template: string
          to_addresses: string[]
        }
        Insert: {
          created_at?: string
          error?: string | null
          from_address?: string
          id?: string
          status?: string
          subject?: string
          submission_id?: string | null
          template?: string
          to_addresses?: string[]
        }
        Update: {
          created_at?: string
          error?: string | null
          from_address?: string
          id?: string
          status?: string
          subject?: string
          submission_id?: string | null
          template?: string
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          construction_signed_at: string | null
          created_at: string
          created_by: string
          customer_signed_at: string | null
          data: Json
          disapproval_note: string | null
          drive_file_id: string | null
          form_type: string
          id: string
          is_draft: boolean
          order_number: string
          pdf_path: string | null
          sale_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          construction_signed_at?: string | null
          created_at?: string
          created_by: string
          customer_signed_at?: string | null
          data?: Json
          disapproval_note?: string | null
          drive_file_id?: string | null
          form_type: string
          id?: string
          is_draft?: boolean
          order_number?: string
          pdf_path?: string | null
          sale_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          construction_signed_at?: string | null
          created_at?: string
          created_by?: string
          customer_signed_at?: string | null
          data?: Json
          disapproval_note?: string | null
          drive_file_id?: string | null
          form_type?: string
          id?: string
          is_draft?: boolean
          order_number?: string
          pdf_path?: string | null
          sale_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      parks: {
        Row: {
          active: boolean
          address: string | null
          brochure_url: string | null
          id: string
          inbox_email: string | null
          name: string
          park_rules_url: string | null
          site_licence_url: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          address?: string | null
          brochure_url?: string | null
          id?: string
          inbox_email?: string | null
          name: string
          park_rules_url?: string | null
          site_licence_url?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          address?: string | null
          brochure_url?: string | null
          id?: string
          inbox_email?: string | null
          name?: string
          park_rules_url?: string | null
          site_licence_url?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          created_by: string
          customer_email: string
          customer_name: string
          customer_phone: string
          deposit_date: string | null
          id: string
          order_number: string
          park_name: string
          sales_person: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          deposit_date?: string | null
          id?: string
          order_number: string
          park_name?: string
          sales_person?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          deposit_date?: string | null
          id?: string
          order_number?: string
          park_name?: string
          sales_person?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_people: {
        Row: {
          active: boolean
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      signing_tokens: {
        Row: {
          created_at: string
          expires_at: string
          kind: string
          submission_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          kind?: string
          submission_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          kind?: string
          submission_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signing_tokens_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_files: {
        Row: {
          created_at: string
          field_key: string
          file_name: string
          id: string
          mime_type: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          file_name: string
          id?: string
          mime_type?: string
          storage_path: string
          submission_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          file_name?: string
          id?: string
          mime_type?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_director: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "rep" | "director"
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
  public: {
    Enums: {
      app_role: ["rep", "director"],
    },
  },
} as const
